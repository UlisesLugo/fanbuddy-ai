import { ChatAnthropic } from '@langchain/anthropic';
import {
  AIMessage,
  BaseMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
} from '@langchain/core/messages';
import type { DynamicStructuredTool } from '@langchain/core/tools';
import { Annotation, END, START, StateGraph } from '@langchain/langgraph';

import type { Itinerary } from '@/lib/types/itinerary';
import type { MockFlightOption } from '@/lib/langchain/tools/mockTravelTools';
import {
  MATCH_END_OFFSET_HOURS,
  mockFlightOptions,
  searchFlightsTool,
  searchHotelsTool,
  searchMatchesTool,
} from '@/lib/langchain/tools/mockTravelTools';

export const FANBUDDY_SYSTEM = `You are FanBuddy.AI — an expert in European football travel logistics. You obsess over supporter safety (realistic connection times, rest before match day) and delivering the best value trips. You never recommend risky same-day tight connections for major finals or high-demand fixtures.`;

const COST_BASELINE_EUR = 650;

export interface UserPreferences {
  originCity: string;
  favoriteTeam: string;
}

export const GraphState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (left, right) => {
      const chunk = Array.isArray(right) ? right : [right as BaseMessage];
      return left.concat(chunk);
    },
    default: () => [],
  }),
  itinerary: Annotation<Itinerary | null>(),
  validation_errors: Annotation<string[]>(),
  user_preferences: Annotation<UserPreferences>(),
  travel_revision_count: Annotation<number>(),
});

export type GraphStateType = typeof GraphState.State;

function destinationFromVenue(venue: string): string {
  const v = venue.toLowerCase();
  if (v.includes('bernabéu') || v.includes('bernabeu')) return 'Madrid';
  if (v.includes('emirates')) return 'London';
  if (v.includes('camp nou') || v.includes('olympic')) return 'Barcelona';
  return 'Madrid';
}

function stayWindow(kickoffIso: string): {
  check_in: string;
  check_out: string;
  nights: number;
} {
  const k = new Date(kickoffIso);
  const inD = new Date(k);
  inD.setUTCDate(inD.getUTCDate() - 1);
  const outD = new Date(k);
  outD.setUTCDate(outD.getUTCDate() + 2);
  const nights = Math.max(
    1,
    Math.round((outD.getTime() - inD.getTime()) / (24 * 60 * 60 * 1000)),
  );
  return {
    check_in: inD.toISOString().slice(0, 10),
    check_out: outD.toISOString().slice(0, 10),
    nights,
  };
}

function buildPlaceholderItinerary(
  match: {
    competition: string;
    venue: string;
    kickoff_iso: string;
    home_team: string;
    away_team: string;
    match_ticket_price_eur: number;
    time_confirmed_by_tv: boolean;
  },
  prefs: UserPreferences,
): Itinerary {
  const dest = destinationFromVenue(match.venue);
  const tbdFlight = {
    label: `${prefs.originCity} → ${dest} (pending)`,
    depart_iso: match.kickoff_iso,
    arrive_iso: match.kickoff_iso,
    carrier: 'Pending',
    price_eur: 0,
  };
  const stay = stayWindow(match.kickoff_iso);
  return {
    status: match.time_confirmed_by_tv ? 'CONFIRMED' : 'PROVISIONAL',
    main_event: {
      competition: match.competition,
      venue: match.venue,
      kickoff_iso: match.kickoff_iso,
      home_team: match.home_team,
      away_team: match.away_team,
      match_ticket_price_eur: match.match_ticket_price_eur,
      time_confirmed_by_tv: match.time_confirmed_by_tv,
    },
    flight_outbound: tbdFlight,
    flight_return: {
      label: `${dest} → ${prefs.originCity} (pending)`,
      depart_iso: match.kickoff_iso,
      arrive_iso: match.kickoff_iso,
      carrier: 'Pending',
      price_eur: 0,
    },
    accommodation: {
      name: 'Pending',
      nights: stay.nights,
      tier: 'mid',
      price_eur: 0,
      status_label: 'Pending',
    },
    costs: {
      flights_eur: 0,
      match_tickets_eur: match.match_ticket_price_eur,
      stay_eur: 0,
      total_eur: match.match_ticket_price_eur,
      currency: 'EUR',
    },
  };
}

async function runToolCallingTurn(
  model: ChatAnthropic,
  tools: DynamicStructuredTool[],
  thread: BaseMessage[],
): Promise<BaseMessage[]> {
  const bound = model.bindTools(tools);
  const byName = Object.fromEntries(tools.map((t) => [t.name, t]));
  const emitted: BaseMessage[] = [];
  let current = thread;

  for (let step = 0; step < 8; step++) {
    const ai = await bound.invoke(current);
    emitted.push(ai);
    current = [...current, ai];
    const calls = ai.tool_calls ?? [];
    if (calls.length === 0) break;
    for (const tc of calls) {
      const t = byName[tc.name];
      if (!t) continue;
      const raw = await t.invoke(tc.args as Record<string, unknown>);
      const content = typeof raw === 'string' ? raw : JSON.stringify(raw);
      const id = tc.id ?? `tool_${tc.name}_${step}`;
      const tm = new ToolMessage({
        content,
        tool_call_id: id,
        name: tc.name,
      });
      emitted.push(tm);
      current = [...current, tm];
    }
  }
  return emitted;
}

function makeModel(): ChatAnthropic {
  return new ChatAnthropic({
    model: 'claude-haiku-4-5-20251001',
    temperature: 0,
  });
}

async function searchMatchesNode(
  state: GraphStateType,
): Promise<{ messages: BaseMessage[]; itinerary: Itinerary }> {
  const prefs = state.user_preferences;
  const thread: BaseMessage[] = [
    new SystemMessage(
      `${FANBUDDY_SYSTEM}\nUse search_matches to fetch fixtures. Call the tool with the supporter's favorite team and a sensible date window from the conversation.`,
    ),
    ...state.messages,
    new HumanMessage(
      `User preferences: origin city "${prefs.originCity}", favorite team "${prefs.favoriteTeam}". Find the best upcoming away or home option for them.`,
    ),
  ];

  type MatchRow = Itinerary['main_event'] & {
    match_ticket_price_eur: number;
    time_confirmed_by_tv: boolean;
  };

  let toolJson: string;
  const msgs: BaseMessage[] = [];

  if (process.env.ANTHROPIC_API_KEY) {
    const emitted = await runToolCallingTurn(
      makeModel(),
      [searchMatchesTool],
      thread,
    );
    msgs.push(...emitted);
    const toolMsg = [...emitted]
      .reverse()
      .find((m) => ToolMessage.isInstance(m));
    toolJson =
      typeof toolMsg?.content === 'string'
        ? toolMsg.content
        : JSON.stringify(toolMsg?.content ?? '{}');
  } else {
    toolJson = (await searchMatchesTool.invoke({
      team: prefs.favoriteTeam,
      date_from: '2026-04-01',
      date_to: '2026-06-30',
    })) as string;
  }

  let match: MatchRow;
  try {
    const parsed = JSON.parse(toolJson) as { matches?: MatchRow[] };
    if (!parsed.matches?.[0]) throw new Error('no matches');
    match = parsed.matches[0];
  } catch {
    const fallback = (await searchMatchesTool.invoke({
      team: prefs.favoriteTeam,
      date_from: '2026-04-01',
      date_to: '2026-06-30',
    })) as string;
    const parsed = JSON.parse(fallback) as { matches: MatchRow[] };
    match = parsed.matches[0];
  }

  const itinerary = buildPlaceholderItinerary(match, prefs);

  msgs.push(
    new AIMessage(
      `Locked in ${match.home_team} vs ${match.away_team} at ${match.venue} (${match.competition}). Next I'll bundle flights and a stay.`,
    ),
  );

  return {
    messages: msgs,
    itinerary,
  };
}

type HotelTier = {
  tier: 'luxury' | 'mid' | 'budget';
  name: string;
  price_eur: number;
};

function pickHotelTier(tiers: HotelTier[], baseline: number): HotelTier {
  const sorted = [...tiers].sort((a, b) => a.price_eur - b.price_eur);
  for (const t of sorted) {
    if (t.price_eur <= baseline) return t;
  }
  return sorted[sorted.length - 1];
}

async function planTravelNode(state: GraphStateType): Promise<{
  messages: BaseMessage[];
  itinerary?: Itinerary;
}> {
  const it = state.itinerary;
  if (!it) {
    return {
      messages: [new AIMessage('No match selected yet; cannot plan travel.')],
    };
  }

  const prefs = state.user_preferences;
  const destCity = destinationFromVenue(it.main_event.venue);
  const kickoff = it.main_event.kickoff_iso;
  const stay = stayWindow(kickoff);
  const revision = state.travel_revision_count;

  const model = makeModel();
  const userPrompt = `Plan transport between "${prefs.originCity}" and "${destCity}" for kickoff ${kickoff}. Use search_flights with origin "${prefs.originCity}", destination "${destCity}", kickoff_iso "${kickoff}", revision_attempt ${revision}. Then use search_hotels with city "${destCity}", check_in "${stay.check_in}", check_out "${stay.check_out}". Prefer the lowest safe total cost.`;

  const thread: BaseMessage[] = [
    new SystemMessage(
      `${FANBUDDY_SYSTEM}\nYou must call search_flights and search_hotels with the exact parameters requested.`,
    ),
    ...state.messages.slice(-12),
    new HumanMessage(userPrompt),
  ];

  if (process.env.ANTHROPIC_API_KEY) {
    const emitted = await runToolCallingTurn(
      model,
      [searchFlightsTool, searchHotelsTool],
      thread,
    );
    const msgs: BaseMessage[] = [...emitted];
    const toolContents = emitted
      .filter((m) => ToolMessage.isInstance(m))
      .map((m) => (typeof m.content === 'string' ? m.content : '{}'));

    let flightOpt: MockFlightOption = mockFlightOptions({
      origin: prefs.originCity,
      destination: destCity,
      kickoff_iso: kickoff,
      revision_attempt: revision,
    })[0];
    let hotelTiers: HotelTier[] = [
      { tier: 'luxury', name: `Grand Stadium ${destCity}`, price_eur: 320 },
      { tier: 'mid', name: `City Center ${destCity}`, price_eur: 195 },
      { tier: 'budget', name: `Fan Lodge ${destCity}`, price_eur: 95 },
    ];

    for (const c of [...toolContents].reverse()) {
      try {
        const p = JSON.parse(c) as {
          options?: MockFlightOption[];
          tiers?: HotelTier[];
        };
        if (p.options?.[0]) {
          flightOpt = p.options[0];
          break;
        }
      } catch {
        /* continue */
      }
    }
    for (const c of toolContents) {
      try {
        const p = JSON.parse(c) as { tiers?: HotelTier[] };
        if (p.tiers?.length) {
          hotelTiers = p.tiers;
          break;
        }
      } catch {
        /* continue */
      }
    }

    const ticket = it.main_event.match_ticket_price_eur;
    let hotel = pickHotelTier(
      hotelTiers,
      COST_BASELINE_EUR - flightOpt.price_eur - ticket,
    );
    let total = flightOpt.price_eur + hotel.price_eur + ticket;
    while (total > COST_BASELINE_EUR && hotel.tier !== 'budget') {
      const next = hotelTiers.filter((x) => x.price_eur < hotel.price_eur);
      if (!next.length) break;
      hotel = next.sort((a, b) => a.price_eur - b.price_eur)[0];
      total = flightOpt.price_eur + hotel.price_eur + ticket;
    }

    const outbound = {
      label: `${prefs.originCity} → ${destCity}`,
      depart_iso: flightOpt.depart_iso,
      arrive_iso: flightOpt.arrive_iso,
      carrier: flightOpt.carrier,
      price_eur: Math.round(flightOpt.price_eur / 2),
    };
    const ret = {
      label: `${destCity} → ${prefs.originCity}`,
      depart_iso: flightOpt.return_depart_iso,
      arrive_iso: flightOpt.return_arrive_iso,
      carrier: flightOpt.carrier,
      price_eur: Math.round(flightOpt.price_eur / 2),
    };
    const flights_eur = outbound.price_eur + ret.price_eur;
    msgs.push(
      new AIMessage(
        `Bundled ${flightOpt.carrier} flights and ${hotel.tier} stay (${hotel.name}). Total estimate before validation: ${flightOpt.price_eur + hotel.price_eur + ticket} EUR.`,
      ),
    );

    return {
      messages: msgs,
      itinerary: {
        ...it,
        flight_outbound: outbound,
        flight_return: ret,
        accommodation: {
          name: hotel.name,
          nights: stay.nights,
          tier: hotel.tier,
          price_eur: hotel.price_eur,
          status_label: 'Suggested',
        },
        costs: {
          flights_eur,
          match_tickets_eur: ticket,
          stay_eur: hotel.price_eur,
          total_eur: flights_eur + ticket + hotel.price_eur,
          currency: 'EUR',
        },
      },
    };
  }

  // No API key: deterministic tool invocations
  const flightRaw = await searchFlightsTool.invoke({
    origin: prefs.originCity,
    destination: destCity,
    kickoff_iso: kickoff,
    revision_attempt: revision,
  });
  const hotelRaw = await searchHotelsTool.invoke({
    city: destCity,
    check_in: stay.check_in,
    check_out: stay.check_out,
  });
  const { options } = JSON.parse(flightRaw as string) as {
    options: MockFlightOption[];
  };
  const flightOpt = options[0];
  const { tiers: hotelTiers } = JSON.parse(hotelRaw as string) as {
    tiers: HotelTier[];
  };
  const ticket = it.main_event.match_ticket_price_eur;
  let hotel = pickHotelTier(
    hotelTiers,
    COST_BASELINE_EUR - flightOpt.price_eur - ticket,
  );
  let total = flightOpt.price_eur + hotel.price_eur + ticket;
  while (total > COST_BASELINE_EUR && hotel.tier !== 'budget') {
    const cheaper = hotelTiers.filter((x) => x.price_eur < hotel.price_eur);
    if (!cheaper.length) break;
    hotel = cheaper.sort((a, b) => a.price_eur - b.price_eur)[0];
    total = flightOpt.price_eur + hotel.price_eur + ticket;
  }

  const outbound = {
    label: `${prefs.originCity} → ${destCity}`,
    depart_iso: flightOpt.depart_iso,
    arrive_iso: flightOpt.arrive_iso,
    carrier: flightOpt.carrier,
    price_eur: Math.round(flightOpt.price_eur / 2),
  };
  const ret = {
    label: `${destCity} → ${prefs.originCity}`,
    depart_iso: flightOpt.return_depart_iso,
    arrive_iso: flightOpt.return_arrive_iso,
    carrier: flightOpt.carrier,
    price_eur: Math.round(flightOpt.price_eur / 2),
  };
  const flights_eur = outbound.price_eur + ret.price_eur;

  return {
    messages: [
      new AIMessage(`Bundled flights and ${hotel.tier} stay (${hotel.name}).`),
    ],
    itinerary: {
      ...it,
      flight_outbound: outbound,
      flight_return: ret,
      accommodation: {
        name: hotel.name,
        nights: stay.nights,
        tier: hotel.tier,
        price_eur: hotel.price_eur,
        status_label: 'Suggested',
      },
      costs: {
        flights_eur,
        match_tickets_eur: ticket,
        stay_eur: hotel.price_eur,
        total_eur: flights_eur + ticket + hotel.price_eur,
        currency: 'EUR',
      },
    },
  };
}

function hoursBetween(aIso: string, bIso: string): number {
  return (
    (new Date(bIso).getTime() - new Date(aIso).getTime()) / (60 * 60 * 1000)
  );
}

function validatorNode(state: GraphStateType): {
  validation_errors: string[];
  travel_revision_count: number;
  itinerary?: Itinerary;
} {
  const it = state.itinerary;
  if (!it) {
    return {
      validation_errors: ['Missing itinerary'],
      travel_revision_count: state.travel_revision_count,
    };
  }

  const errors: string[] = [];
  const kickoff = it.main_event.kickoff_iso;
  const arrive = it.flight_outbound.arrive_iso;
  const depart = it.flight_return.depart_iso;
  const matchEnd = new Date(kickoff);
  matchEnd.setUTCHours(matchEnd.getUTCHours() + MATCH_END_OFFSET_HOURS);
  const matchEndIso = matchEnd.toISOString();

  if (hoursBetween(arrive, kickoff) < 6) {
    errors.push('Arrival buffer < 6h (landing to kickoff)');
  }
  if (hoursBetween(matchEndIso, depart) < 4) {
    errors.push('Departure buffer < 4h (match end to outbound takeoff)');
  }

  const status: Itinerary['status'] = it.main_event.time_confirmed_by_tv
    ? 'CONFIRMED'
    : 'PROVISIONAL';

  const nextCount =
    errors.length > 0 && state.travel_revision_count < 3
      ? state.travel_revision_count + 1
      : state.travel_revision_count;

  return {
    validation_errors: errors,
    travel_revision_count: nextCount,
    itinerary: { ...it, status },
  };
}

function formatterNode(state: GraphStateType): {
  messages: BaseMessage[];
  itinerary?: Itinerary;
} {
  const it = state.itinerary;
  if (!it) {
    const failed = {
      planning_failed: true,
      validation_errors: state.validation_errors,
      summary_line: 'Could not build a trip — no itinerary.',
    };
    return {
      messages: [
        new AIMessage(JSON.stringify({ error: 'no_itinerary', ...failed })),
      ],
    };
  }

  const planning_failed = state.validation_errors.length > 0;
  const finalItinerary: Itinerary = {
    ...it,
    status: it.main_event.time_confirmed_by_tv ? 'CONFIRMED' : 'PROVISIONAL',
    planning_failed,
    validation_errors: planning_failed ? [...state.validation_errors] : [],
    summary_line: planning_failed
      ? `Trip drafted with issues: ${state.validation_errors.join('; ')}`
      : `Ready: ${it.main_event.home_team} vs ${it.main_event.away_team} — ${it.costs.total_eur} EUR all-in estimate.`,
  };

  return {
    itinerary: finalItinerary,
    messages: [
      new AIMessage(
        `${finalItinerary.summary_line}\n\n${JSON.stringify(finalItinerary)}`,
      ),
    ],
  };
}

function routeAfterValidator(
  state: GraphStateType,
): 'plan_travel' | 'formatter' {
  if (!state.itinerary) return 'formatter';
  if (state.validation_errors.length > 0 && state.travel_revision_count < 3) {
    return 'plan_travel';
  }
  return 'formatter';
}

let compiled: ReturnType<typeof buildGraph> | null = null;

function buildGraph() {
  const g = new StateGraph(GraphState)
    .addNode('search_matches', searchMatchesNode)
    .addNode('plan_travel', planTravelNode)
    .addNode('validator', validatorNode)
    .addNode('formatter', formatterNode)
    .addEdge(START, 'search_matches')
    .addEdge('search_matches', 'plan_travel')
    .addEdge('plan_travel', 'validator')
    .addConditionalEdges('validator', routeAfterValidator, {
      plan_travel: 'plan_travel',
      formatter: 'formatter',
    })
    .addEdge('formatter', END);

  return g.compile();
}

export function compile() {
  if (!compiled) compiled = buildGraph();
  return compiled;
}
