import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Colors from '../constants/Colors';

import { useRiderStore } from '../store/riderStore';

const { width } = Dimensions.get('window');

/**
 * A custom tab bar for Material Top Tabs to look like a floating Bottom Tab Bar.
 * This supports Ionicons, badges, and the rounded floating design.
 */
export default function FloatingTabBar({ state, descriptors, navigation }) {
  const { activeOrder } = useRiderStore();

  return (
    <View style={styles.container}>
      <View style={styles.tabBar}>
        {state.routes
          .filter(route => {
            const { options } = descriptors[route.key];
            const name = route.name;
            
            // 1. Basic Filters
            if (options.href === null || name.includes('[') || !options.title) return false;

            // 2. Role Detection & Specific Whitelisting
            // If the navigator contains 'requests', it's the Rider Layout.
            // If it contains 'products/index', it's the Vendor Layout.
            const isRider = state.routes.some(r => r.name === 'requests');
            
            const vendorWhitelist = ['index', 'products/index', 'earnings', 'profile'];
            const riderWhitelist = ['requests', 'earnings', 'profile'];

            if (isRider) {
              return riderWhitelist.includes(name);
            } else {
              return vendorWhitelist.includes(name);
            }
          })
          .map((route) => {
            const { options } = descriptors[route.key];
            const isFocused = state.routes[state.index].key === route.key;

            // Updated Icon Mapping
            const getIconName = (routeName, focused) => {
              if (routeName === 'requests' && activeOrder) {
                 return focused ? 'car' : 'car-outline'; // Active Delivery
              }
              const map = {
                'index': focused ? 'receipt' : 'receipt-outline', // Vendor Orders
                'requests': focused ? 'bicycle' : 'bicycle-outline',
                'products/index': focused ? 'restaurant' : 'restaurant-outline',
                'earnings': focused ? 'wallet' : 'wallet-outline',
                'profile': focused ? 'person-circle' : 'person-circle-outline',
              };
              return map[routeName] || 'apps-outline';
            };

            // Short & Clean Labels
            const getLabel = (routeName) => {
              const map = {
                'index': 'Orders',
                'requests': activeOrder ? 'Tracking' : 'Delivery',
                'products/index': 'Menu',
                'earnings': 'Earn',
                'profile': 'Profile',
              };
              return map[routeName] || routeName;
            };

            return (
              <TouchableOpacity
                key={route.key}
                onPress={() => navigation.navigate(route.name)}
                style={styles.tabItem}
                activeOpacity={0.7}
              >
                <View style={styles.iconWrapper}>
                  <Ionicons 
                    name={getIconName(route.name, isFocused)} 
                    size={24} 
                    color={isFocused ? Colors.primary : Colors.subText} 
                  />
                  {options.tabBarBadge && (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{options.tabBarBadge}</Text>
                    </View>
                  )}
                </View>
                <Text style={[
                  styles.tabLabel, 
                  { color: isFocused ? Colors.primary : Colors.subText }
                ]}>
                  {getLabel(route.name)}
                </Text>
              </TouchableOpacity>
            );
          })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    zIndex: 100,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: Colors.white,
    borderRadius: 35,
    height: 75,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 10,
  },
  tabItem: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 4,
  },
  badge: {
    position: 'absolute',
    right: -8,
    top: -4,
    backgroundColor: Colors.error,
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: Colors.white,
  },
  badgeText: {
    color: Colors.white,
    fontSize: 9,
    fontWeight: 'bold',
  }
});
