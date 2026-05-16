import { View, Text, StyleSheet, Platform, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Colors from '../../constants/Colors';
import { MaterialTopTabs } from '../../components/MaterialTopTabs';
import FloatingTabBar from '../../components/FloatingTabBar';
import VendorHeaderToggle from '../../components/VendorHeaderToggle';
import { useVendorStore } from '../../store/vendorStore';

export default function VendorLayout() {
  const incomingOrders = useVendorStore((state) => state.incomingOrders);
  const pendingCount = incomingOrders.length;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Vendor Panel</Text>
        <VendorHeaderToggle />
      </View>
      
      <MaterialTopTabs
        tabBar={(props) => <FloatingTabBar {...props} />}
        screenOptions={{
          tabBarPosition: 'bottom',
          swipeEnabled: false,
          headerShown: false,
        }}
      >
        <MaterialTopTabs.Screen
          name="index"
          options={{
            title: 'Live Orders',
            tabBarBadge: pendingCount > 0 ? pendingCount : undefined,
          }}
        />
        <MaterialTopTabs.Screen
          name="products/index"
          options={{
            title: 'Store Menu',
          }}
        />
        <MaterialTopTabs.Screen
          name="earnings"
          options={{
            title: 'Financials',
          }}
        />
        <MaterialTopTabs.Screen
          name="profile"
          options={{
            title: 'My Store',
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
