import { View, Text, StyleSheet, Platform, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Colors from '../../constants/Colors';
import { MaterialTopTabs } from '../../components/MaterialTopTabs';
import FloatingTabBar from '../../components/FloatingTabBar';
import RiderHeaderToggle from '../../components/RiderHeaderToggle';
import { useRiderStore } from '../../store/riderStore';

export default function RiderLayout() {
  const activeOrder = useRiderStore((state) => state.activeOrder);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Rider Partner</Text>
        <RiderHeaderToggle />
      </View>

      <MaterialTopTabs
        tabBar={(props) => <FloatingTabBar {...props} />}
        screenOptions={{
          tabBarPosition: 'bottom',
          swipeEnabled: true,
          headerShown: false,
        }}
      >
        <MaterialTopTabs.Screen
          name="requests"
          options={{
            title: 'Pickup Requests',
            tabBarBadge: activeOrder ? '1' : undefined,
          }}
        />
        <MaterialTopTabs.Screen
          name="earnings"
          options={{
            title: 'Rider Earnings',
          }}
        />
        <MaterialTopTabs.Screen
          name="profile"
          options={{
            title: 'Rider Profile',
          }}
        />
      </MaterialTopTabs>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.white,
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.white,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.black,
  }
});
