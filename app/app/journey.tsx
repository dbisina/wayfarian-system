// app/app/journey.tsx
// The old Start Journey screen is retired: rides are recorded on the ride screen. This route stays
// only so links, notifications and older navigation that still point here land in the right place.

import { Redirect, useLocalSearchParams } from 'expo-router';

export default function JourneyRedirect() {
  const { groupId } = useLocalSearchParams<{ groupId?: string }>();
  // A crew ride is started from the crew page; everything else is a normal ride.
  if (groupId) return <Redirect href={{ pathname: '/group-detail', params: { groupId: String(groupId) } } as never} />;
  return <Redirect href={'/ride' as never} />;
}
