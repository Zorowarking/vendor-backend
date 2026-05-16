import React, { useEffect, useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { 
  View, 
  Text, 
  StyleSheet, 
  FlatList, 
  TouchableOpacity, 
  Image, 
  Switch, 
  RefreshControl,
  ScrollView,
  Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Dimensions } from 'react-native';
import Colors from '../../../constants/Colors';
import { vendorApi } from '../../../services/vendorApi';
import { useVendorStore } from '../../../store/vendorStore';
import { SkeletonLoader } from '../../../components/SkeletonLoader';
import EmptyState from '../../../components/EmptyState';
import ErrorState from '../../../components/ErrorState';
import { socketService } from '../../../services/socketService';


const { width } = Dimensions.get('window');

export default function ProductsList() {
  const router = useRouter();
  const { products, setProducts } = useVendorStore();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeCategory, setActiveCategory] = useState('All');

  const [error, setError] = useState(null);

  const fetchProducts = useCallback(async (isManualRefresh = false) => {
    setError(null);
    try {
      console.log('Fetching products...');
      const data = await vendorApi.getProducts();
      
      // Always sync to ensure Fresh Data from the database on every tab focus
      console.log('Syncing products to store:', data?.length);
      setProducts(data);

    } catch (err) {
      setError("Failed to load products. Please check your connection.");
    } finally {

      setLoading(false);
      setRefreshing(false);
    }
  }, [setProducts]);

  // Refresh data when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      fetchProducts();
    }, [fetchProducts])
  );

  // Real-time updates via Socket.IO
  useEffect(() => {
    const handleProductUpdate = ({ productId, status }) => {
      console.log(`[SOCKET] Received product update: ${productId} -> ${status}`);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      
      setProducts(prev => {
        if (!prev) return prev;
        return prev.map(p => p.id === productId ? { ...p, reviewStatus: status } : p);
      });
    };

    socketService.onProductStatusUpdate(handleProductUpdate);
    return () => socketService.offProductStatusUpdate(handleProductUpdate);
  }, [setProducts]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchProducts(true);
  }, [fetchProducts]);

  const setActiveCategoryWithHaptics = (category) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActiveCategory(category);
  };


  const toggleAvailability = async (id, currentStatus) => {
    // Optimistic update
    setProducts(prev => 
      prev.map(p => p.id === id ? { ...p, isAvailable: !currentStatus } : p)
    );
    
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await vendorApi.toggleProductAvailability(id, !currentStatus);
    } catch (error) {
      // Rollback on failure
      setProducts(prev => 
        prev.map(p => p.id === id ? { ...p, isAvailable: currentStatus } : p)
      );
      Alert.alert('Error', 'Failed to update availability. Please check your connection.');
    }
  };

  const handleDelete = (id) => {
    Alert.alert(
      'Delete Product',
      'Are you sure you want to delete this product?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive',
          onPress: async () => {
            try {
              await vendorApi.deleteProduct(id);
              setProducts(prev => prev.filter(p => p.id !== id));
            } catch (error) {
              Alert.alert('Error', 'Failed to delete product');
            }
          }
        }
      ]
    );
  };

  const categories = ['All', ...new Set((products || []).map(p => p.category))];
  const filteredProducts = activeCategory === 'All' 
    ? (products || [])
    : (products || []).filter(p => p.category === activeCategory);

  const renderProductItem = ({ item }) => (
    <TouchableOpacity 
      style={styles.productCard}
      onLongPress={() => {
        Alert.alert(
          item.name,
          'Choose an action',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Edit', onPress: () => router.push(`/(vendor)/products/edit/${item.id}`) },
            { text: 'Delete', style: 'destructive', onPress: () => handleDelete(item.id) }
          ]
        );
      }}
    >
      <Image source={{ uri: item.image }} style={styles.productImage} />
      <View style={styles.productInfo}>
        <Text style={styles.productName}>{item.name}</Text>
        <Text style={styles.productCategory}>{item.category} • {item.type}</Text>
        <Text style={styles.productPrice}>₹{(item.price || 0).toFixed(2)}</Text>
      </View>

      <View style={styles.actionContainer}>
        <Switch
          value={item.isAvailable}
          onValueChange={() => item.reviewStatus === 'pending_review' ? Alert.alert('Under Review', 'This item is under review and cannot be activated yet.') : toggleAvailability(item.id, item.isAvailable)}
          trackColor={{ false: Colors.border, true: Colors.success + '40' }}
          thumbColor={item.isAvailable ? Colors.success : Colors.subText}
          disabled={item.reviewStatus === 'pending_review'}
        />
        <Text style={[styles.availabilityText, { color: item.reviewStatus === 'pending_review' ? Colors.warning : (item.isAvailable ? Colors.success : Colors.subText) }]}>
          {item.reviewStatus === 'pending_review' ? 'Review Pending' : (item.isAvailable ? 'Active' : 'Inactive')}
        </Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.categoryContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryScroll}>
          {categories.map(cat => (
            <TouchableOpacity 
              key={cat} 
              style={[styles.categoryTab, activeCategory === cat && styles.activeCategoryTab]}
              onPress={() => setActiveCategoryWithHaptics(cat)}
            >
              <Text style={[styles.categoryText, activeCategory === cat && styles.activeCategoryText]}>{cat}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
      
      {error && (
        <ErrorState message={error} onRetry={() => fetchProducts(true)} />
      )}

      {!error && (loading && products.length === 0 ? (
        <View style={{ padding: 16 }}>
          {[1, 2, 3, 4].map(i => (
            <SkeletonLoader key={i} width={width - 32} height={100} style={{ marginBottom: 16, borderRadius: 12 }} />
          ))}
        </View>
      ) : (
        <FlatList
          data={filteredProducts}
          renderItem={renderProductItem}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.primary]} />}
          ListEmptyComponent={
            <EmptyState 
              icon="fast-food-outline" 
              title="No products yet" 
              description={activeCategory === 'All' ? "Add your first product to get started." : `No products found in ${activeCategory}.`}
            >
              {activeCategory === 'All' && (
                <TouchableOpacity 
                  style={[styles.activeCategoryTab, { marginTop: 20, paddingHorizontal: 20 }]}
                  onPress={() => router.push('/(vendor)/products/add')}
                >
                  <Text style={styles.activeCategoryText}>Add Product</Text>
                </TouchableOpacity>
              )}
            </EmptyState>
          }
        />
      ))}


      <TouchableOpacity 
        style={styles.fab}
        onPress={() => router.push('/(vendor)/products/add')}
      >
        <Ionicons name="add" size={30} color={Colors.white} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.grey,
  },
  categoryContainer: {
    backgroundColor: Colors.white,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  categoryScroll: {
    paddingHorizontal: 16,
  },
  categoryTab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
    backgroundColor: Colors.grey,
  },
  activeCategoryTab: {
    backgroundColor: Colors.primary,
  },
  categoryText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.subText,
  },
  activeCategoryText: {
    color: Colors.white,
  },
  listContent: { padding: 16, paddingBottom: 120 },
  productCard: {
    flexDirection: 'row',
    backgroundColor: Colors.white,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  productImage: {
    width: 80,
    height: 80,
    borderRadius: 8,
  },
  productInfo: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'center',
  },
  productName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.black,
    marginBottom: 4,
  },
  productCategory: {
    fontSize: 12,
    color: Colors.subText,
    marginBottom: 4,
  },
  productPrice: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.primary,
  },
  actionContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 70,
  },
  availabilityText: {
    fontSize: 10,
    marginTop: 4,
    fontWeight: 'bold',
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 120,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  emptyContainer: {
    alignItems: 'center',
    marginTop: 50,
  },
  emptyText: {
    fontSize: 16,
    color: Colors.subText,
  }
});
