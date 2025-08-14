export interface LeaderboardEntry {
  id: string;
  rank: string;
  country: string;
  distance: string;
  avatar: string;
}

export const leaderboardData: LeaderboardEntry[] = [
  {
    id: '1',
    rank: '1',
    country: 'United States',
    distance: '12,345 mi',
    avatar: 'https://codia-f2c.s3.us-west-1.amazonaws.com/image/2025-08-14/jimoxiPVNd.png',
  },
  {
    id: '2',
    rank: '2',
    country: 'Canada',
    distance: '11,876 mi',
    avatar: 'https://codia-f2c.s3.us-west-1.amazonaws.com/image/2025-08-14/Fm3jGn12Yb.png',
  },
  {
    id: '3',
    rank: '3',
    country: 'United Kingdom',
    distance: '10,543 mi',
    avatar: 'https://codia-f2c.s3.us-west-1.amazonaws.com/image/2025-08-14/7rgQhF3vCn.png',
  },
  {
    id: '4',
    rank: '4',
    country: 'Germany',
    distance: '9,210 mi',
    avatar: 'https://codia-f2c.s3.us-west-1.amazonaws.com/image/2025-08-14/y5DHvCN6Zn.png',
  },
  {
    id: '5',
    rank: '5',
    country: 'Australia',
    distance: '8,765 mi',
    avatar: 'https://codia-f2c.s3.us-west-1.amazonaws.com/image/2025-08-14/Kgu86vc5yw.png',
  },
  {
    id: '6',
    rank: '6',
    country: 'France',
    distance: '7,432 mi',
    avatar: 'https://codia-f2c.s3.us-west-1.amazonaws.com/image/2025-08-14/YveWSTBN7S.png',
  },
  {
    id: '7',
    rank: '7',
    country: 'Italy',
    distance: '6,987 mi',
    avatar: 'https://codia-f2c.s3.us-west-1.amazonaws.com/image/2025-08-14/tshqJQYrUv.png',
  },
  {
    id: '8',
    rank: '8',
    country: 'Spain',
    distance: '5,654 mi',
    avatar: 'https://codia-f2c.s3.us-west-1.amazonaws.com/image/2025-08-14/sZaiCrvK6s.png',
  },
  {
    id: '9',
    rank: '9',
    country: 'Japan',
    distance: '4,321 mi',
    avatar: 'https://codia-f2c.s3.us-west-1.amazonaws.com/image/2025-08-14/VriyYTmecz.png',
  },
  {
    id: '10',
    rank: '10',
    country: 'Brazil',
    distance: '3,000 mi',
    avatar: 'https://codia-f2c.s3.us-west-1.amazonaws.com/image/2025-08-14/sR9Nz6ZFu9.png',
  },
];
