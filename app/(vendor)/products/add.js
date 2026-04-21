import React, { useState } from 'react';
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
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import Colors from '../../../constants/Colors';
import { vendorApi } from '../../../services/vendorApi';
import { useVendorStore } from '../../../store/vendorStore';

export default function AddProduct() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const addProductToStore = useVendorStore((state) => state.addProductToStore);
  
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
  const [showAddOnForm, setShowAddOnForm] = useState(false);

  // Mock Categories and Types (Usually fetched from API)
  const [categories, setCategories] = useState(['Pizza', 'Burgers', 'Pasta', 'Salads']);
  const [types, setTypes] = useState(['Veg', 'Non-Veg', 'Vegan']);

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
    setAddOns([...addOns, { id: Date.now().toString(), name: addOnName, price: parseFloat(addOnPrice) }]);
    setAddOnName('');
    setAddOnPrice('');
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

    setLoading(true);
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
        addOns
      };

      console.log('Attempting to save product:', productData);
      const res = await vendorApi.addProduct(productData);
      console.log('Add Product API Result:', res);

      // Add to local store for immediate UI update
      if (res.product) {
        addProductToStore(res.product);
      } else {
        addProductToStore({ ...productData, id: res.id || Date.now().toString() });
      }

      Alert.alert('Submitted', 'Product submitted for review. It will be activated once approved by the admin.', [
        { text: 'OK', onPress: () => setTimeout(() => router.back(), 100) }
      ]);

    } catch (error) {
      console.error('Add Product Error:', error);
      Alert.alert('Error', 'Failed to add product');
    } finally {
      setLoading(false);
    }
  };

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
            <Text style={styles.label}>Price ($) *</Text>
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
            <TextInput 
              style={[styles.input, { flex: 1, marginRight: 8 }]} 
              placeholder="Add-on Name" 
              value={addOnName} 
              onChangeText={setAddOnName} 
            />
            <TextInput 
              style={[styles.input, { width: 80, marginRight: 8 }]} 
              placeholder="Price" 
              keyboardType="numeric"
              value={addOnPrice} 
              onChangeText={setAddOnPrice} 
            />
            <TouchableOpacity onPress={addAddOn} style={styles.saveAddOnButton}>
              <Ionicons name="checkmark" size={24} color={Colors.white} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowAddOnForm(false)} style={styles.cancelAddOnButton}>
              <Ionicons name="close" size={24} color={Colors.white} />
            </TouchableOpacity>
          </View>
        )}

        {addOns.map(item => (
          <View key={item.id} style={styles.addOnListItem}>
            <Text style={styles.addOnName}>{item.name}</Text>
            <Text style={styles.addOnPrice}>+${item.price.toFixed(2)}</Text>
            <TouchableOpacity onPress={() => removeAddOn(item.id)}>
              <Ionicons name="trash-outline" size={20} color={Colors.error} />
            </TouchableOpacity>
          </View>
        ))}

        <TouchableOpacity 
          style={[styles.saveButton, loading && styles.disabledButton]} 
          onPress={handleSave}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={Colors.white} />
          ) : (
            <Text style={styles.saveButtonText}>Save Product</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
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
  disabledButton: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: Colors.white,
    fontSize: 18,
    fontWeight: 'bold',
  }
});
