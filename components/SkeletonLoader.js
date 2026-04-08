import React, { useEffect } from 'react';
import { View, StyleSheet, Animated, Easing } from 'react-native';
import Colors from '../constants/Colors';

export const SkeletonLoader = ({ width: propWidth, height: propHeight, borderRadius = 8, style }) => {
  const width = Number(propWidth) || 100;
  const height = Number(propHeight) || 20;
  const animatedValue = new Animated.Value(0);

  useEffect(() => {
    Animated.loop(
      Animated.timing(animatedValue, {
        toValue: 1,
        duration: 1000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();
  }, []);

  const translateX = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: [-width, width],
  });


  return (
    <View style={[styles.skeleton, { width, height, borderRadius }, style]}>
      <Animated.View
        style={[
          styles.shimmer,
          {
            width: width * 1.5,
            height: height * 1.5,
            top: -height * 0.25,
            left: -width * 0.25,
            transform: [{ translateX }, { rotate: '45deg' }],
          },
        ]}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  skeleton: {
    backgroundColor: '#E1E9EE',
    overflow: 'hidden',
  },
  shimmer: {
    position: 'absolute',
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
    opacity: 0.5,
  },
});

