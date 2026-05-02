import React, { useEffect, useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity, 
  Dimensions, 
  ActivityIndicator,
  RefreshControl
} from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import * as Haptics from 'expo-haptics';
import Colors from '../../constants/Colors';
import { vendorApi } from '../../services/vendorApi';
import { SkeletonLoader } from '../../components/SkeletonLoader';
import ErrorState from '../../components/ErrorState';
import EmptyState from '../../components/EmptyState';


const SCREEN_WIDTH = Dimensions.get('window').width;

export default function VendorEarnings() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [period, setPeriod] = useState('daily');
  const [data, setData] = useState(null);

  const [error, setError] = useState(null);

  const fetchData = async (selectedPeriod = period) => {
    setError(null);
    try {
      const result = await vendorApi.getEarnings(selectedPeriod);
      setData(result);
    } catch (err) {
      setError("Failed to load earnings data. Please try again.");
    } finally {

      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [period]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const setPeriodWithHaptics = (p) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPeriod(p);
  };

  if (error) {
    return <ErrorState message={error} onRetry={() => fetchData()} />;
  }

  if (loading && !data) {
    return (
      <View style={styles.container}>
        <View style={styles.tabContainer}>
           {[1, 2, 3].map(i => <SkeletonLoader key={i} width={SCREEN_WIDTH/3.5} height={40} style={{ borderRadius: 8, marginHorizontal: 5 }} />)}
        </View>
        <View style={styles.content}>
           <View style={styles.summaryGrid}>
             <SkeletonLoader width="48%" height={80} style={{ borderRadius: 12 }} />
             <SkeletonLoader width="48%" height={80} style={{ borderRadius: 12 }} />
             <SkeletonLoader width="100%" height={100} style={{ borderRadius: 12, marginTop: 12 }} />
           </View>
           <SkeletonLoader width={SCREEN_WIDTH - 32} height={220} style={{ borderRadius: 12, marginBottom: 20 }} />
           <SkeletonLoader width={SCREEN_WIDTH - 32} height={200} style={{ borderRadius: 12 }} />
        </View>
      </View>
    );
  }

  // Final safety check to prevent "Cannot read property of null"
  if (!data) return null;

  const periods = [
    { label: 'Today', value: 'daily' },
    { label: 'This Week', value: 'weekly' },
    { label: 'This Month', value: 'monthly' }
  ];

  // Prepare safe chart data
  const chartData = data.chartData || {
    labels: ['-'],
    datasets: [{ data: [0] }]
  };

  return (
    <ScrollView 
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 120 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.primary]} />}
    >
      {/* Period Selector */}
      <View style={styles.tabContainer}>
        {periods.map(p => (
          <TouchableOpacity 
            key={p.value} 
            style={[styles.tab, period === p.value && styles.activeTab]}
            onPress={() => setPeriodWithHaptics(p.value)}
          >
            <Text style={[styles.tabText, period === p.value && styles.activeTabText]}>{p.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.content}>
        {/* Summary Cards */}
        <View style={styles.summaryGrid}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Total Revenue</Text>
            <Text style={styles.summaryValue}>₹{Number(data.revenue || 0).toFixed(2)}</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Platform Fee</Text>
            <Text style={[styles.summaryValue, { color: Colors.error }]}>-₹{Number(data.commission || 0).toFixed(2)}</Text>
          </View>
          <View style={[styles.summaryCard, { width: '100%', marginTop: 12, backgroundColor: Colors.primary }]}>
            <Text style={[styles.summaryLabel, { color: Colors.white }]}>Net Earnings</Text>
            <Text style={[styles.summaryValue, { color: Colors.white, fontSize: 28 }]}>₹{Number(data.net || 0).toFixed(2)}</Text>
          </View>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{data.orderCount || 0}</Text>
            <Text style={styles.statLabel}>Orders</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>₹{(Number(data.revenue || 0) / (data.orderCount || 1)).toFixed(2)}</Text>
            <Text style={styles.statLabel}>Avg. Order</Text>
          </View>
        </View>

        {/* Chart */}
        <View style={styles.chartSection}>
          <Text style={styles.sectionTitle}>Revenue Trend</Text>
          <LineChart
            data={chartData}
            width={SCREEN_WIDTH - 32}
            height={220}
            chartConfig={{
              backgroundColor: Colors.white,
              backgroundGradientFrom: Colors.white,
              backgroundGradientTo: Colors.white,
              decimalPlaces: 0,
              color: (opacity = 1) => `rgba(255, 114, 94, ${opacity})`, // Colors.primary
              labelColor: (opacity = 1) => `rgba(102, 102, 102, ${opacity})`,
              style: { borderRadius: 16 },
              propsForDots: { r: "4", strokeWidth: "2", stroke: Colors.primary }
            }}
            bezier
            style={styles.chart}
          />
        </View>

        {/* Detailed Breakdown */}
        {data.breakdown && data.breakdown.length > 0 && (
          <View style={styles.tableSection}>
            <Text style={styles.sectionTitle}>Detailed Breakdown</Text>
            <View style={styles.tableHeader}>
              <Text style={[styles.tableCol, { flex: 1.5 }]}>Date</Text>
              <Text style={styles.tableCol}>Orders</Text>
              <Text style={styles.tableCol}>Gross</Text>
              <Text style={styles.tableCol}>Net</Text>
            </View>
            {data.breakdown.map((row, idx) => (
              <View key={idx} style={styles.tableRow}>
                <Text style={[styles.tableCell, { flex: 1.5 }]}>{row.date}</Text>
                <Text style={styles.tableCell}>{row.count}</Text>
                <Text style={styles.tableCell}>₹{Number(row.gross || 0).toFixed(2)}</Text>
                <Text style={[styles.tableCell, { fontWeight: 'bold', color: Colors.success }]}>₹{Number(row.net || 0).toFixed(2)}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.white
  },
  container: {
    flex: 1, backgroundColor: Colors.grey
  },
  tabContainer: {
    flexDirection: 'row', backgroundColor: Colors.white, padding: 12, borderBottomWidth: 1, borderBottomColor: Colors.border
  },
  tab: {
    flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8
  },
  activeTab: {
    backgroundColor: Colors.primary + '15'
  },
  tabText: {
    fontSize: 14, fontWeight: '600', color: Colors.subText
  },
  activeTabText: {
    color: Colors.primary
  },
  content: {
    padding: 16
  },
  summaryGrid: {
    flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 20
  },
  summaryCard: {
    backgroundColor: Colors.white, width: '48%', padding: 16, borderRadius: 12,
    elevation: 2, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }
  },
  summaryLabel: {
    fontSize: 12, color: Colors.subText, marginBottom: 4
  },
  summaryValue: {
    fontSize: 22, fontWeight: 'bold', color: Colors.black
  },
  statsRow: {
    flexDirection: 'row', backgroundColor: Colors.white, borderRadius: 12, padding: 16, marginBottom: 24, alignItems: 'center'
  },
  statItem: {
    flex: 1, alignItems: 'center'
  },
  statValue: {
    fontSize: 20, fontWeight: 'bold', color: Colors.black
  },
  statLabel: {
    fontSize: 12, color: Colors.subText, marginTop: 2
  },
  divider: {
    width: 1, height: 30, backgroundColor: Colors.border
  },
  chartSection: {
    backgroundColor: Colors.white, borderRadius: 12, padding: 16, marginBottom: 24
  },
  sectionTitle: {
    fontSize: 18, fontWeight: 'bold', color: Colors.black, marginBottom: 16
  },
  chart: {
    marginVertical: 8, borderRadius: 16, marginLeft: -16
  },
  tableSection: {
    backgroundColor: Colors.white, borderRadius: 12, padding: 16, marginBottom: 40
  },
  tableHeader: {
    flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: Colors.border, paddingBottom: 10, marginBottom: 10
  },
  tableCol: {
    flex: 1, fontSize: 12, fontWeight: 'bold', color: Colors.subText, textAlign: 'center'
  },
  tableRow: {
    flexDirection: 'row', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.grey
  },
  tableCell: {
    flex: 1, fontSize: 13, color: Colors.black, textAlign: 'center'
  }
});
