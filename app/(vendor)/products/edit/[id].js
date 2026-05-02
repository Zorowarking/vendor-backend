import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TextInput, 
  TouchableOpacity, 
  ScrollView, 
  Switch, 
  Image, 
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import Colors from '../../../../constants/Colors';
import { vendorApi } from '../../../../services/vendorApi';
import { useVendorStore } from '../../../../store/vendorStore';

export default function EditProduct() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Form State
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [category, setCategory] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [type, setType] = useState('Veg');
  const [newType, setNewType] = useState('');
  const [isRestricted, setIsRestricted] = useState(false);
  const [isAvailable, setIsAvailable] = useState(true);
  const [image, setImage] = useState(null);
  const [addOns, setAddOns] = useState([]);
  
  // Add-on State
  const [addOnName, setAddOnName] = useState('');
  const [addOnPrice, setAddOnPrice] = useState('');
  const [addOnFreeLimit, setAddOnFreeLimit] = useState('0');
  const [showAddOnForm, setShowAddOnForm] = useState(false);

  // Mock Categories and Types
  const [categories, setCategories] = useState(['Pizza', 'Burgers', 'Pasta', 'Salads']);
  const [types, setTypes] = useState(['Veg', 'Non-Veg', 'Vegan']);

  useEffect(() => {
    const fetchProduct = async () => {
      try {
        const products = await vendorApi.getProducts();
        const product = products.find(p => p.id === id);
        if (product) {
          setName(product.name);
          setDescription(product.description || '');
          setPrice((product.price || 0).toString());
          setCategory(product.category);
          setType(product.type);
          setIsAvailable(product.isAvailable);
          setImage(product.image);
          // Mocking add-ons if they don't exist in the list
          setAddOns(product.addOns || [
            { id: 'a1', name: 'Extra Cheese', price: 20.00 },
            { id: 'a2', name: 'Mushrooms', price: 15.00 }
          ]);
        }
      } catch (error) {
        Alert.alert('Error', 'Failed to fetch product data');
      } finally {
        setLoading(false);
      }
    };
    fetchProduct();
  }, [id]);

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 1,
    });

    if (!result.canceled) {
      setImage(result.assets[0].uri);
    }
  };

  const addAddOn = () => {
    if (!addOnName || !addOnPrice) {
      Alert.alert('Error', 'Please enter add-on name and price');
      return;
    }
    setAddOns([...addOns, { 
      id: Date.now().toString(), 
      name: addOnName, 
      price: parseFloat(addOnPrice),
      freeLimit: parseInt(addOnFreeLimit) || 0
    }]);
    setAddOnName('');
    setAddOnPrice('');
    setAddOnFreeLimit('0');
    setShowAddOnForm(false);
  };

  const removeAddOn = (id) => {
    setAddOns(addOns.filter(item => item.id !== id));
  };

  const handleSave = async () => {
    if (!name || !price) {
      Alert.alert('Error', 'Product Name and Price are required');
      return;
    }

    if (parseFloat(price) <= 0) {
      Alert.alert('Error', 'Price must be greater than 0');
      return;
    }

    if (!category || (category === 'New' && !newCategory)) {
      Alert.alert('Error', 'Please select or enter a category');
      return;
    }

    if (!type || (type === 'New' && !newType)) {
      Alert.alert('Error', 'Please select or enter a product type');
      return;
    }

    setSaving(true);
    try {
      let imageUrl = image;
      if (image && !image.startsWith('http')) {
        const uploadResult = await vendorApi.uploadImage(image);
        imageUrl = uploadResult.url;
      }

      const finalCategory = category === 'New' ? newCategory : category;
      const finalType = type === 'New' ? newType : type;

      const productData = {
        name,
        description,
        price: parseFloat(price),
        category: finalCategory,
        type: finalType,
        isRestricted,
        isAvailable,
        image: imageUrl,
        addOns: addOns.map(a => ({
          name: a.name,
          price: parseFloat(a.price) || 0,
          freeLimit: parseInt(a.freeLimit) || 0
        }))
      };

      const res = await vendorApi.updateProduct(id, productData);
      
      // Update local store for immediate UI feedback
      const { setProducts, products: currentProducts } = useVendorStore.getState();
      const updatedProducts = currentProducts.map(p => 
        p.id === id ? { ...p, ...productData, reviewStatus: res.product?.reviewStatus || p.reviewStatus } : p
      );
      setProducts(updatedProducts);

      const message = res.reviewTriggered 
        ? 'Product details updated and submitted for review. It will be re-activated once approved.'
        : 'Product updated successfully.';

      Alert.alert(res.reviewTriggered ? 'Under Review' : 'Success', message, [
        { text: 'OK', onPress: () => router.back() }
      ]);
    } catch (error) {
      const errorMsg = error.response?.data?.details || error.message || 'Unknown error';
      Alert.alert('Error', `Update Error: ${errorMsg}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Product',
      'Are you sure you want to delete this product? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive',
          onPress: async () => {
            try {
              await vendorApi.deleteProduct(id);
              router.back();
            } catch (error) {
              Alert.alert('Error', 'Failed to delete product');
            }
          }
        }
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView 
      style={{ flex: 1 }} 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}
    >
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.section}>
          <Text style={styles.label}>Product Image</Text>
          <TouchableOpacity style={styles.imagePicker} onPress={pickImage}>
            {image ? (
              <Image source={{ uri: image }} style={styles.selectedImage} />
            ) : (
              <View style={styles.imagePlaceholder}>
                <Ionicons name="camera-outline" size={40} color={Colors.subText} />
                <Text style={styles.placeholderText}>Tap to select image</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Product Name *</Text>
          <TextInput 
            style={styles.input} 
            placeholder="Enter product name" 
            value={name} 
            onChangeText={setName} 
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Description</Text>
          <TextInput 
            style={[styles.input, styles.textArea]} 
            placeholder="Enter description" 
            multiline 
            numberOfLines={4}
            value={description}
            onChangeText={setDescription}
          />
        </View>

        <View style={styles.row}>
          <View style={[styles.section, { flex: 1, marginRight: 8 }]}>
            <Text style={styles.label}>Price (₹) *</Text>
            <TextInput 
              style={styles.input} 
              placeholder="0.00" 
              keyboardType="numeric"
              value={price}
              onChangeText={setPrice}
            />
          </View>
          <View style={[styles.section, { flex: 1, marginLeft: 8 }]}>
            <Text style={styles.label}>Category</Text>
            <View style={styles.pickerContainer}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {categories.map(cat => (
                  <TouchableOpacity 
                    key={cat} 
                    style={[styles.chip, category === cat && styles.activeChip]}
                    onPress={() => setCategory(cat)}
                  >
                    <Text style={[styles.chipText, category === cat && styles.activeChipText]}>{cat}</Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity 
                  style={[styles.chip, category === 'New' && styles.activeChip]}
                  onPress={() => setCategory('New')}
                >
                  <Text style={[styles.chipText, category === 'New' && styles.activeChipText]}>+ New</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
            {category === 'New' && (
              <TextInput 
                style={[styles.input, { marginTop: 8 }]} 
                placeholder="New Category Name" 
                value={newCategory} 
                onChangeText={setNewCategory} 
              />
            )}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Type</Text>
          <View style={styles.pickerContainer}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {types.map(t => (
                <TouchableOpacity 
                  key={t} 
                  style={[styles.chip, type === t && styles.activeChip]}
                  onPress={() => setType(t)}
                >
                  <Text style={[styles.chipText, type === t && styles.activeChipText]}>{t}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity 
                style={[styles.chip, type === 'New' && styles.activeChip]}
                onPress={() => setType('New')}
              >
                <Text style={[styles.chipText, type === 'New' && styles.activeChipText]}>+ New</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
          {type === 'New' && (
            <TextInput 
              style={[styles.input, { marginTop: 8 }]} 
              placeholder="New Type Name" 
              value={newType} 
              onChangeText={setNewType} 
            />
          )}
        </View>

        <View style={styles.toggleRow}>
          <View>
            <Text style={styles.label}>Age Restricted</Text>
            <Text style={styles.subLabel}>Requires ID verification on delivery</Text>
          </View>
          <Switch 
            value={isRestricted} 
            onValueChange={setIsRestricted}
            trackColor={{ false: Colors.border, true: Colors.error + '40' }}
            thumbColor={isRestricted ? Colors.error : Colors.subText}
          />
        </View>

        <View style={styles.toggleRow}>
          <View>
            <Text style={styles.label}>Available Now</Text>
            <Text style={styles.subLabel}>Show this product in store</Text>
          </View>
          <Switch 
            value={isAvailable} 
            onValueChange={setIsAvailable}
            trackColor={{ false: Colors.border, true: Colors.success + '40' }}
            thumbColor={isAvailable ? Colors.success : Colors.subText}
          />
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Add-ons</Text>
          <TouchableOpacity onPress={() => setShowAddOnForm(true)} style={styles.addButton}>
            <Ionicons name="add-circle-outline" size={20} color={Colors.primary} />
            <Text style={styles.addButtonText}>Add Add-on</Text>
          </TouchableOpacity>
        </View>

        {showAddOnForm && (
          <View style={styles.addOnForm}>
            <View style={{ flex: 1 }}>
              <TextInput 
                style={[styles.input, { marginBottom: 8 }]} 
                placeholder="Add-on Name" 
                value={addOnName} 
                onChangeText={setAddOnName} 
              />
              <View style={{ flexDirection: 'row' }}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={{ fontSize: 10, color: Colors.subText, marginBottom: 2 }}>Price (₹)</Text>
                  <TextInput 
                    style={styles.input} 
                    placeholder="Price" 
                    keyboardType="numeric"
                    value={addOnPrice} 
                    onChangeText={setAddOnPrice} 
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 10, color: Colors.subText, marginBottom: 2 }}>Free Qty Limit</Text>
                  <TextInput 
                    style={styles.input} 
                    placeholder="Limit" 
                    keyboardType="numeric"
                    value={addOnFreeLimit} 
                    onChangeText={setAddOnFreeLimit} 
                  />
                </View>
              </View>
            </View>
            <View style={{ marginLeft: 8 }}>
              <TouchableOpacity onPress={addAddOn} style={[styles.saveAddOnButton, { marginBottom: 8 }]}>
                <Ionicons name="checkmark" size={24} color={Colors.white} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowAddOnForm(false)} style={styles.cancelAddOnButton}>
                <Ionicons name="close" size={24} color={Colors.white} />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {addOns.map(item => (
          <View key={item.id} style={styles.addOnListItem}>
            <View style={{ flex: 1 }}>
              <Text style={styles.addOnName}>{item.name}</Text>
              {item.freeLimit > 0 && (
                <Text style={{ fontSize: 11, color: Colors.success, fontWeight: '500' }}>
                  First {item.freeLimit} units free
                </Text>
              )}
            </View>
            <Text style={styles.addOnPrice}>+₹{Number(item.price || 0).toFixed(2)}</Text>
            <TouchableOpacity onPress={() => removeAddOn(item.id)}>
              <Ionicons name="trash-outline" size={20} color={Colors.error} />
            </TouchableOpacity>
          </View>
        ))}

        <TouchableOpacity 
          style={[styles.saveButton, saving && styles.disabledButton]} 
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color={Colors.white} />
          ) : (
            <Text style={styles.saveButtonText}>Save Changes</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.deleteButton} 
          onPress={handleDelete}
        >
          <Ionicons name="trash-outline" size={20} color={Colors.error} />
          <Text style={styles.deleteButtonText}>Delete Product</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    flex: 1,
    backgroundColor: Colors.white,
  },
  content: {
    padding: 16,
    paddingBottom: 100,
  },

  section: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.black,
    marginBottom: 8,
  },
  subLabel: {
    fontSize: 12,
    color: Colors.subText,
  },
  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: Colors.grey,
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  row: {
    flexDirection: 'row',
  },
  imagePicker: {
    aspectRatio: 16 / 9,
    backgroundColor: Colors.grey,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    borderStyle: 'dashed',
    overflow: 'hidden',
  },
  imagePlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    marginTop: 8,
    color: Colors.subText,
    fontSize: 14,
  },
  selectedImage: {
    width: '100%',
    height: '100%',
  },
  pickerContainer: {
    flexDirection: 'row',
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: Colors.grey,
    borderWidth: 1,
    borderColor: Colors.border,
    marginRight: 8,
  },
  activeChip: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  chipText: {
    fontSize: 14,
    color: Colors.subText,
  },
  activeChipText: {
    color: Colors.white,
    fontWeight: '600',
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    marginBottom: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.black,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  addButtonText: {
    color: Colors.primary,
    fontWeight: '600',
    marginLeft: 4,
  },
  addOnForm: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    backgroundColor: Colors.grey,
    padding: 8,
    borderRadius: 8,
  },
  saveAddOnButton: {
    backgroundColor: Colors.success,
    padding: 8,
    borderRadius: 8,
    marginRight: 4,
  },
  cancelAddOnButton: {
    backgroundColor: Colors.error,
    padding: 8,
    borderRadius: 8,
  },
  addOnListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: Colors.grey,
    borderRadius: 8,
    marginBottom: 8,
  },
  addOnName: {
    flex: 1,
    fontSize: 14,
    color: Colors.black,
  },
  addOnPrice: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.primary,
    marginRight: 12,
  },
  saveButton: {
    backgroundColor: Colors.primary,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 30,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    marginTop: 16,
    borderWidth: 1,
    borderColor: Colors.error,
    borderRadius: 12,
  },
  deleteButtonText: {
    color: Colors.error,
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  disabledButton: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: Colors.white,
    fontSize: 18,
    fontWeight: 'bold',
  }
});
