// Ambient type declarations for the `amadeus` npm package.
// The package ships CommonJS without bundled .d.ts files.
// This covers the subset of the API used in lib/amadeus-flights.ts.

declare module 'amadeus' {
  interface AmadeusConstructorOptions {
    clientId: string;
    clientSecret: string;
    hostname?: 'test' | 'production';
  }

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

  class Amadeus {
    constructor(opts: AmadeusConstructorOptions);
    shopping: {
      flightOffersSearch: {
        get(params: FlightOffersGetParams): Promise<FlightOffersSearchResponse>;
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
