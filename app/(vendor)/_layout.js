import { View, Text, StyleSheet, Platform, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Colors from '../../constants/Colors';
import { MaterialTopTabs } from '../../components/MaterialTopTabs';
import FloatingTabBar from '../../components/FloatingTabBar';
import VendorHeaderToggle from '../../components/VendorHeaderToggle';
import { useVendorStore } from '../../store/vendorStore';
import { useSegments } from 'expo-router';

export default function VendorLayout() {
  const segments = useSegments();
  const incomingOrders = useVendorStore((state) => state.incomingOrders);
  const hasUnreadActivity = useVendorStore((state) => state.hasUnreadActivity);
  const pendingCount = incomingOrders.length;

  // Stricter check: Only show the main header on the 4 primary tabs.
  // The last segment of a main tab will be 'index', 'products', 'earnings', or 'profile'.
  const currentPath = segments[segments.length - 1];
  const isTabScreen = !currentPath || ['(vendor)', 'index', 'products', 'earnings', 'profile'].includes(currentPath);

  return (
    <View style={styles.container}>
      {isTabScreen && (
        <SafeAreaView edges={['top']} style={styles.header}>
          <Text style={styles.headerTitle}>Vendor Panel</Text>
          <VendorHeaderToggle />
        </SafeAreaView>
      )}
      
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
            tabBarBadge: pendingCount > 0 ? pendingCount : (hasUnreadActivity ? '!' : undefined),
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
        <MaterialTopTabs.Screen
          name="reviews"
          options={{
            title: 'Reviews',
          }}
        />
        <MaterialTopTabs.Screen
          name="products/add"
          options={{
            title: 'Add Product',
          }}
        />
        <MaterialTopTabs.Screen
          name="products/edit/[id]"
          options={{
            title: 'Edit Product',
          }}
        />
        <MaterialTopTabs.Screen
          name="orders/[orderId]"
          options={{
            title: 'Order Details',
          }}
        />
      </MaterialTopTabs>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.white,
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
