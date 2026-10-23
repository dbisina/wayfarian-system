// app/app/journey.tsx
// The old Start Journey screen is retired: rides are recorded on the ride screen. This route stays
// only so links, notifications and older navigation that still point here land in the right place.

import { Redirect, useLocalSearchParams } from 'expo-router';

export default function JourneyRedirect() {
  const { groupJourneyId } = useLocalSearchParams<{ groupJourneyId?: string }>();
  // A legacy group journey keeps its own live screen; everything else is a normal ride.
  if (groupJourneyId) return <Redirect href={{ pathname: '/group-journey', params: { groupJourneyId } } as never} />;
  return <Redirect href={'/ride' as never} />;
}
