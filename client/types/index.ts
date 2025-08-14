export interface CategoryItem {
  id: number;
  label: string;
  width: number;
}

export interface FloatingButtonConfig {
  iconUri: string;
  size: number;
  borderRadius: number;
  padding: {
    horizontal: number;
    vertical: number;
  };
}

export interface LeaderboardEntry {
  id: string;
  rank: string;
  country: string;
  distance: string;
  avatar: string;
}

export interface TabNavigationProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

