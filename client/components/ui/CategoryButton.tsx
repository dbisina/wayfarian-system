import React from 'react';
import {
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';

interface CategoryButtonProps {
  label: string;
  width: number;
  marginLeft: number;
}

const CategoryButton: React.FC<CategoryButtonProps> = ({
  label,
  width,
  marginLeft,
}) => {
  return (
    <TouchableOpacity
      style={[
        styles.container,
        { width, marginLeft },
      ]}
      activeOpacity={0.8}
    >
      <Text style={styles.label}>{label}</Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    height: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 2,
  },
  label: {
    fontFamily: 'Poppins-Regular',
    fontWeight: '400',
    fontSize: 12,
    lineHeight: 18,
    color: '#000000',
    textAlign: 'center',
  },
});

export default CategoryButton;
