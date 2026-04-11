// Ambient type declarations for the `amadeus` npm package.
// The package ships CommonJS without bundled .d.ts files.
// This covers the subset of the API used in lib/amadeus-flights.ts
// and lib/amadeus-hotels.ts.

declare module 'amadeus' {
  interface AmadeusConstructorOptions {
    clientId: string;
    clientSecret: string;
    hostname?: 'test' | 'production';
  }

  // ── Flight types ─────────────────────────────────────────────────────────────

  interface FlightOffersGetParams {
    originLocationCode: string;
    destinationLocationCode: string;
    departureDate: string;
    returnDate: string;
    adults: number;
    currencyCode?: string;
    max?: number;
  }

  interface FlightOfferSegment {
    departure: { iataCode: string; at: string };
    arrival: { iataCode: string; at: string };
    carrierCode: string;
    number: string;
    numberOfStops: number;
  }

  interface FlightOfferItinerary {
    duration: string;
    segments: FlightOfferSegment[];
  }

  interface FlightOffer {
    id: string;
    price: { grandTotal: string; currency: string };
    validatingAirlineCodes?: string[];
    numberOfBookableSeats?: number;
    itineraries: FlightOfferItinerary[];
  }

  interface FlightOffersSearchResponse {
    data: FlightOffer[];
  }

  // ── Hotel types ───────────────────────────────────────────────────────────────

  interface HotelsByCityGetParams {
    cityCode: string;
    radius?: number;
    radiusUnit?: 'KM' | 'MILE';
    hotelSource?: 'ALL' | 'BEDBANK' | 'DIRECTCHAIN';
  }

  interface HotelListItem {
    hotelId: string;
    name: string;
    iataCode?: string;
    geoCode?: { latitude: number; longitude: number };
  }

  interface HotelListResponse {
    data: HotelListItem[];
  }

  interface HotelOffersSearchGetParams {
    hotelIds: string;
    checkInDate: string;
    checkOutDate: string;
    adults: number;
    roomQuantity?: number;
    currency?: string;
    bestRateOnly?: boolean;
  }

  interface HotelOfferPrice {
    total: string;
    currency: string;
  }

  interface HotelOfferCancellation {
    deadline?: string;
    amount?: string;
  }

  interface HotelOfferPolicies {
    cancellations?: HotelOfferCancellation[];
  }

  interface HotelOffer {
    id: string;
    price: HotelOfferPrice;
    policies?: HotelOfferPolicies;
  }

  interface HotelOffersItem {
    hotel: {
      hotelId: string;
      name: string;
      rating?: string;
      amenities?: string[];
      latitude?: number;
      longitude?: number;
    };
    offers: HotelOffer[];
    available: boolean;
  }

  interface HotelOffersSearchResponse {
    data: HotelOffersItem[];
  }

  // ── Client ────────────────────────────────────────────────────────────────────

  class Amadeus {
    constructor(opts: AmadeusConstructorOptions);
    shopping: {
      flightOffersSearch: {
        get(params: FlightOffersGetParams): Promise<FlightOffersSearchResponse>;
      };
      hotelOffersSearch: {
        get(params: HotelOffersSearchGetParams): Promise<HotelOffersSearchResponse>;
      };
    };
    referenceData: {
      locations: {
        hotels: {
          byCity: {
            get(params: HotelsByCityGetParams): Promise<HotelListResponse>;
          };
        };
      };
    };
    booking: {
      flightOrders: {
        post(body: unknown): Promise<unknown>;
      };
    };
  }

  export = Amadeus;
}
