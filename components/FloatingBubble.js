import React, { useRef, useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  Animated, 
  PanResponder, 
  TouchableOpacity, 
  Dimensions, 
  Platform 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Colors from '../constants/Colors';
import { useRouter, useSegments } from 'expo-router';
import { useVendorStore } from '../store/vendorStore';

const { width, height } = Dimensions.get('window');
const BUBBLE_SIZE = 60;
const EDGE_PADDING = 20;

export default function FloatingBubble() {
  const router = useRouter();
  const segments = useSegments();
  const incomingOrders = useVendorStore((state) => state.incomingOrders);
  const activeOrders = useVendorStore((state) => state.activeOrders);
  const totalActive = (incomingOrders?.length || 0) + (activeOrders?.length || 0);

  // Hide the bubble entirely on the products/menu screens to avoid blocking the FAB
  const isProductsScreen = segments.includes('products');
  
  const pan = useRef(new Animated.ValueXY({ x: EDGE_PADDING, y: 150 })).current; // Start top-left by default to avoid FAB
  const scale = useRef(new Animated.Value(0)).current;
  const labelOpacity = useRef(new Animated.Value(0)).current;
  const [visible, setVisible] = useState(false);
  const [labelText, setLabelText] = useState('');

  useEffect(() => {
    if (totalActive > 0) {
      const isNew = totalActive > (useVendorStore.getState().incomingOrders.length + useVendorStore.getState().activeOrders.length - 1);
      setLabelText(isNew ? 'New Order!' : `${totalActive} orders pending`);
      
      setVisible(true);
      Animated.parallel([
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 5 }),
        Animated.sequence([
          Animated.timing(labelOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.delay(4000),
          Animated.timing(labelOpacity, { toValue: 0, duration: 500, useNativeDriver: true })
        ])
      ]).start();
    } else {
      Animated.timing(scale, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true
      }).start(() => setVisible(false));
    }
  }, [totalActive]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) > 2 || Math.abs(gesture.dy) > 2,
      onPanResponderGrant: () => {
        pan.setOffset({
          x: pan.x._value,
          y: pan.y._value
        });
        pan.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], {
        useNativeDriver: false,
      }),
      onPanResponderRelease: (e, gestureState) => {
        pan.flattenOffset();
        
        // Snap to nearest edge
        const targetX = gestureState.moveX > width / 2 ? width - BUBBLE_SIZE - EDGE_PADDING : EDGE_PADDING;
        const targetY = Math.max(100, Math.min(height - 150, gestureState.moveY - BUBBLE_SIZE / 2));
        
        Animated.spring(pan, {
          toValue: { x: targetX, y: targetY },
          useNativeDriver: false,
          friction: 6
        }).start();

        // If it was a tap (minimal movement)
        if (Math.abs(gestureState.dx) < 5 && Math.abs(gestureState.dy) < 5) {
          handlePress();
        }
      },
    })
  ).current;

  const handlePress = () => {
    router.push('/(vendor)');
  };

  if (!visible || isProductsScreen) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [
            { translateX: pan.x },
            { translateY: pan.y },
          ],
        },
      ]}
    >
      <Animated.View style={[styles.labelContainer, { opacity: labelOpacity }]}>
        <View style={styles.labelBubble}>
          <Text style={styles.labelText}>{labelText}</Text>
        </View>
      </Animated.View>

      <Animated.View
        {...panResponder.panHandlers}
        style={[
          styles.bubble,
          {
            transform: [{ scale: scale }],
          },
        ]}
      >
        <TouchableOpacity activeOpacity={0.8} onPress={handlePress} style={styles.content}>
          <Ionicons name="notifications" size={28} color={Colors.white} />
          {totalActive > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{totalActive}</Text>
            </View>
          )}
        </TouchableOpacity>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    zIndex: 9999,
    flexDirection: 'row',
    alignItems: 'center',
  },
  bubble: {
    width: BUBBLE_SIZE,
    height: BUBBLE_SIZE,
    borderRadius: BUBBLE_SIZE / 2,
    backgroundColor: Colors.primary,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  labelContainer: {
    marginRight: 8,
    position: 'absolute',
    right: BUBBLE_SIZE + 10,
    minWidth: 120,
  },
  labelBubble: {
    backgroundColor: 'rgba(0,0,0,0.8)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  labelText: {
    color: Colors.white,
    fontSize: 12,
    fontWeight: 'bold',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: Colors.error,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.white,
    paddingHorizontal: 4,
  },
  badgeText: {
    color: Colors.white,
    fontSize: 10,
    fontWeight: 'bold',
  },
});
