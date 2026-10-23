// app/app/group-journey.tsx
// The old live group journey screen is retired. Crew rides run on the ride screen and the group live
// view. This route stays only for notifications and links that still point here.

import { Redirect, useLocalSearchParams } from 'expo-router';

export default function GroupJourneyRedirect() {
  const { groupId } = useLocalSearchParams<{ groupId?: string }>();
  if (groupId) return <Redirect href={{ pathname: '/group-detail', params: { groupId: String(groupId) } } as never} />;
  return <Redirect href={'/groups' as never} />;
}
