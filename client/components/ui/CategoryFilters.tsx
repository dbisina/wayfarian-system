import React from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
} from 'react-native';
import CategoryButton from './CategoryButton';

const categories = [
  { id: 1, label: 'Gas', width: 48 },
  { id: 2, label: 'Hotel', width: 55 },
  { id: 3, label: 'Restaurant', width: 90 },
  { id: 4, label: 'Attractions', width: 90 },
  { id: 5, label: 'Shopping', width: 82 },
];

const CategoryFilters: React.FC = () => {
  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {categories.map((category, index) => (
          <CategoryButton
            key={category.id}
            label={category.label}
            width={category.width}
            marginLeft={index === 0 ? 0 : 7}
          />
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 91,
    left: 15,
    right: 15,
    zIndex: 2,
  },
  scrollContent: {
    paddingRight: 15,
  },
});

export default CategoryFilters;
