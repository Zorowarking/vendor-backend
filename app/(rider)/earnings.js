import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  FlatList, 
  TouchableOpacity, 
  ScrollView,
  ActivityIndicator,
  Dimensions
} from 'react-native';



import { Ionicons } from '@expo/vector-icons';
import { RefreshControl } from 'react-native';
import * as Haptics from 'expo-haptics';
import Colors from '../../constants/Colors';

import { riderApi } from '../../services/riderApi';
import { SkeletonLoader } from '../../components/SkeletonLoader';
import EmptyState from '../../components/EmptyState';
import ErrorState from '../../components/ErrorState';


export default function RiderEarnings() {
  const [period, setPeriod] = useState('today');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState(null);


  useEffect(() => {
    fetchEarnings();
  }, [period]);

  const [error, setError] = useState(null);

  const fetchEarnings = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await riderApi.getEarnings(period);
      setStats(data);
    } catch (err) {
      setError("Failed to load your earnings. Please try again later.");
    } finally {

      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchEarnings();
  };


  const SummaryCard = ({ label, value, icon, subValue }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardLabel}>{label}</Text>
        <Ionicons name={icon} size={20} color={Colors.primary} />
      </View>
      <Text style={styles.cardValue}>${value}</Text>
      {subValue && <Text style={styles.cardSubValue}>{subValue}</Text>}
    </View>
  );

  const renderHistoryItem = ({ item }) => (
    <View style={styles.historyItem}>
      <View style={styles.historyLeft}>
        <View style={styles.historyIcon}>
          <Ionicons name="checkmark-circle" size={24} color={Colors.success} />
        </View>
        <View>
          <Text style={styles.historyOrder}>Order #{item.orderId}</Text>
          <Text style={styles.historyDate}>{item.date}</Text>
          <View style={styles.breakdownRow}>
            <Text style={styles.breakdownText}>Fixed: ${item.fixedAmount.toFixed(2)}</Text>
            <View style={styles.dotSeparator} />
            <Text style={styles.breakdownText}>Dist: ${item.distanceBonus.toFixed(2)}</Text>
          </View>
        </View>
      </View>
      <View style={styles.historyRight}>
        <Text style={styles.historyAmount}>+${item.amount.toFixed(2)}</Text>
        <Text style={styles.historyStatus}>{item.status}</Text>
      </View>
    </View>
  );

  if (error) {
    return (
      <View style={styles.container}>
        <ErrorState message={error} onRetry={() => fetchEarnings()} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Period Selector */}
      <View style={styles.selectorContainer}>
        {['today', 'week', 'month'].map((p) => (
          <TouchableOpacity 
            key={p} 
            style={[styles.selectorBtn, period === p && styles.activeBtn]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setPeriod(p);
            }}
          >
            <Text style={[styles.selectorText, period === p && styles.activeText]}>
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>


      {loading ? (
        <View style={{ flex: 1 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.cardsScroll}>
            {[1, 2, 3].map(i => (
              <SkeletonLoader 
                key={i} 
                width={220} 
                height={130} 
                style={{ marginRight: 16, borderRadius: 16 }} 
              />
            ))}
          </ScrollView>
          <View style={styles.historyContainer}>
            <SkeletonLoader width={150} height={24} style={{ marginBottom: 16 }} />
            {[1, 2, 3, 4].map(i => (
              <SkeletonLoader 
                key={i} 
                width={width - 32} 
                height={80} 
                style={{ marginBottom: 12, borderRadius: 12 }} 
              />
            ))}
          </View>
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          <FlatList
            ListHeaderComponent={
              <>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.cardsScroll}>
                  <SummaryCard 
                    label="Total Earnings" 
                    value={stats?.totalEarnings || 0} 
                    icon="wallet"
                    subValue={`${stats?.completedDeliveries || 0} deliveries completed`}
                  />
                  <SummaryCard 
                    label="Fixed Pay" 
                    value={stats?.fixedPay || 0} 
                    icon="cash"
                  />
                  <SummaryCard 
                    label="Distance Bonus" 
                    value={stats?.distanceBonus || 0} 
                    icon="navigate"
                  />
                </ScrollView>
                <Text style={[styles.sectionTitle, { marginHorizontal: 16 }]}>Delivery History</Text>
              </>
            }
            data={stats?.history || []}
            renderItem={renderHistoryItem}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.listContent}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.primary]} />}
            ListHeaderComponentStyle={{ marginBottom: 20 }}
            ListEmptyComponent={
              <EmptyState 
                icon="receipt-outline" 
                title="No history yet" 
                description={`You haven't completed any deliveries ${period === 'today' ? 'today' : 'in this period'} yet.`}
              />
            }
          />
        </View>
      )}

    </View>
  );
}

const { width } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.grey },
  selectorContainer: { 
    flexDirection: 'row', backgroundColor: Colors.white, 
    padding: 10, margin: 16, borderRadius: 12, elevation: 2 
  },
  selectorBtn: { flex: 1, padding: 10, alignItems: 'center', borderRadius: 8 },
  activeBtn: { backgroundColor: Colors.primary },
  selectorText: { fontSize: 14, fontWeight: '600', color: Colors.subText },
  activeText: { color: Colors.white },
  
  cardsScroll: { paddingLeft: 16, marginBottom: 20 },
  card: { 
    backgroundColor: Colors.white, width: 220, padding: 16, 
    borderRadius: 16, marginRight: 16, elevation: 3, height: 130, justifyContent: 'space-between'
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardLabel: { fontSize: 13, color: Colors.subText, fontWeight: '600' },
  cardValue: { fontSize: 32, fontWeight: 'bold', color: Colors.black },
  cardSubValue: { fontSize: 11, color: Colors.success, fontWeight: '600' },

  historyContainer: { flex: 1, paddingHorizontal: 16 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 16 },
  listContent: { paddingBottom: 120 },
  historyItem: { 
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: Colors.white, padding: 15, borderRadius: 12, marginBottom: 12, elevation: 1
  },
  historyLeft: { flexDirection: 'row', alignItems: 'center' },
  historyIcon: { 
    width: 40, height: 40, borderRadius: 20, 
    backgroundColor: Colors.success + '20', 
    justifyContent: 'center', alignItems: 'center', marginRight: 12
  },
  historyOrder: { fontWeight: 'bold', fontSize: 15, color: Colors.black },
  historyDate: { fontSize: 12, color: Colors.subText, marginTop: 2 },
  breakdownRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  breakdownText: { fontSize: 11, color: Colors.subText },
  dotSeparator: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: Colors.border, marginHorizontal: 6 },
  historyRight: { alignItems: 'flex-end' },
  historyAmount: { fontWeight: 'bold', fontSize: 16, color: Colors.success },
  historyStatus: { fontSize: 10, color: Colors.subText, textTransform: 'uppercase', marginTop: 2 },
  
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyContainer: { alignItems: 'center', marginTop: 40 },
  emptyText: { color: Colors.subText, fontSize: 16 }
});
