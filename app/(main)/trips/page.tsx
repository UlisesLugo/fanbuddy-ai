export default function TripsPage() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-2 p-8 text-center">
      <p className="text-lg font-semibold text-foreground">My Trips</p>
      <p className="max-w-sm text-sm text-muted-foreground">
        Saved itineraries will appear in this space.
      </p>
    </div>
  );
}
