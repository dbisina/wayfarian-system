import React from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
} from 'react-native';
import Header from '../../components/layout/Header';
import MyGroupsSection from '../../components/MyGroupsSection';
import CreateJoinSection from '../../components/CreateJoinSection';
import BottomNavigation from '../../components/navigation/BottomNavigation';

const GroupsScreen = () => {
  return (
    <View style={styles.container}>
      <Header />
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <MyGroupsSection />
        <CreateJoinSection />
      </ScrollView>
      <BottomNavigation activeTab="groups" />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  content: {
    flex: 1,
  },
});

export default GroupsScreen;
