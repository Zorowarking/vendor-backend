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
  const [isCustomizable, setIsCustomizable] = useState(false);
  const [customizationGroups, setCustomizationGroups] = useState([]);
  const [templateId, setTemplateId] = useState(null);
  
  // Add-on State
  const [addOnName, setAddOnName] = useState('');
  const [addOnPrice, setAddOnPrice] = useState('');
  const [addOnFreeLimit, setAddOnFreeLimit] = useState('0');
  const [showAddOnForm, setShowAddOnForm] = useState(false);

  // Categories and Types fetched from API
  const [categories, setCategories] = useState([]);
  const [types, setTypes] = useState(['Veg', 'Non-Veg', 'Vegan']);
  const [allTemplates, setAllTemplates] = useState([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [products, templatesRes] = await Promise.all([
          vendorApi.getProducts(),
          vendorApi.getTemplates()
        ]);

        if (templatesRes.success && templatesRes.templates) {
          setAllTemplates(templatesRes.templates);
          const cats = [...new Set(templatesRes.templates.map(t => t.category))];
          setCategories(cats);
        }

        const product = products.find(p => p.id === id);
        if (product) {
          setName(product.name);
          setDescription(product.description || '');
          setPrice((product.price || 0).toString());
          setCategory(product.category);
          setType(product.type);
          setIsAvailable(product.isAvailable);
          setImage(product.image);
          setIsCustomizable(product.isCustomizable || false);
          setCustomizationGroups(product.customizationGroups || []);
          setAddOns(product.addOns || []);
          setTemplateId(product.templateId || null);
        }
      } catch (error) {
        Alert.alert('Error', 'Failed to fetch product data');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id]);

  const handleTemplateSelect = (template) => {
    setName(template.templateName);
    setCategory(template.category);
    setTemplateId(template.id);
    if (template.templateData) {
      setDescription(template.templateData.description || '');
      setPrice(template.templateData.price?.toString() || '');
      setType(template.templateData.type || 'Veg');
      if (template.templateData.addOns) {
        setAddOns(template.templateData.addOns.map(a => ({
          id: Math.random().toString(),
          name: a.name,
          price: a.price,
          freeLimit: a.freeLimit || 0
        })));
      }
      if (template.templateData?.customizationGroups) {
        setCustomizationGroups(template.templateData.customizationGroups.map(g => ({
          ...g,
          id: Math.random().toString(),
          options: (g.options || []).map(o => ({
            ...o,
            id: Math.random().toString(),
            priceModifier: o.priceModifier || 0,
            allowQuantity: o.allowQuantity || false,
            freeLimit: o.freeLimit || 0,
            conflicts: o.conflicts || []
          }))
        })));
        setIsCustomizable(true);
      }
    }
  };

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

  // Customization Logic
  const addCustomizationGroup = () => {
    setCustomizationGroups([...customizationGroups, {
      id: Date.now().toString(),
      name: '',
      isRequired: false,
      selectionType: 'SINGLE', // SINGLE, MULTIPLE
      maxSelections: 1,
      options: []
    }]);
  };

  const removeCustomizationGroup = (groupId) => {
    setCustomizationGroups(customizationGroups.filter(g => g.id !== groupId));
  };

  const updateCustomizationGroup = (groupId, updates) => {
    setCustomizationGroups(customizationGroups.map(g => g.id === groupId ? { ...g, ...updates } : g));
  };

  const addOptionToGroup = (groupId) => {
    setCustomizationGroups(customizationGroups.map(g => {
      if (g.id === groupId) {
        return {
          ...g,
          options: [...g.options, { 
            id: Date.now().toString(), 
            name: '', 
            priceModifier: 0,
            allowQuantity: false,
            freeLimit: 0
          }]
        };
      }
      return g;
    }));
  };

  const removeOptionFromGroup = (groupId, optionId) => {
    setCustomizationGroups(customizationGroups.map(g => {
      if (g.id === groupId) {
        return {
          ...g,
          options: g.options.filter(o => o.id !== optionId)
        };
      }
      return g;
    }));
  };

  const updateOptionInGroup = (groupId, optionId, updates) => {
    setCustomizationGroups(customizationGroups.map(g => {
      if (g.id === groupId) {
        return {
          ...g,
          options: g.options.map(o => o.id === optionId ? { ...o, ...updates } : o)
        };
      }
      return g;
    }));
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
        isCustomizable,
        customizationType: isCustomizable ? 'BUILD_YOUR_OWN' : 'NORMAL',
        customizationGroups: isCustomizable ? customizationGroups : [],
        addOns: addOns.map(a => ({
          name: a.name,
          price: parseFloat(a.price) || 0,
          freeLimit: parseInt(a.freeLimit) || 0
        })),
        templateId
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
          <Text style={styles.label}>Categories & Templates</Text>
          <Text style={styles.subLabel}>Select a category or a quick template to pre-fill details</Text>
          <View style={styles.verticalPicker}>
            {[...new Set([...categories, ...allTemplates.map(t => t.category)])].map(cat => (
              <View key={cat} style={styles.categoryGroup}>
                <TouchableOpacity 
                  style={[styles.categoryHeader, category === cat && styles.activeCategoryHeader]}
                  onPress={() => setCategory(cat)}
                >
                  <Text style={[styles.categoryHeaderText, category === cat && styles.activeCategoryHeaderText]}>{cat}</Text>
                  <Ionicons name={category === cat ? "chevron-down" : "chevron-forward"} size={16} color={category === cat ? Colors.white : Colors.subText} />
                </TouchableOpacity>
                
                {category === cat && (
                  <View style={styles.templateList}>
                    {allTemplates.filter(t => t.category === cat).map(t => (
                      <TouchableOpacity 
                        key={t.id} 
                        style={styles.templateItem}
                        onPress={() => handleTemplateSelect(t)}
                      >
                        <Ionicons name="flash-outline" size={14} color={Colors.primary} />
                        <Text style={styles.templateItemText}>{t.templateName}</Text>
                      </TouchableOpacity>
                    ))}
                    <TouchableOpacity 
                      style={styles.templateItem}
                      onPress={() => {}}
                    >
                      <Text style={[styles.templateItemText, { color: Colors.subText, fontStyle: 'italic' }]}>Custom {cat} item</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            ))}
            <TouchableOpacity 
              style={[styles.categoryHeader, category === 'New' && styles.activeCategoryHeader]}
              onPress={() => setCategory('New')}
            >
              <Text style={[styles.categoryHeaderText, category === 'New' && styles.activeCategoryHeaderText]}>+ Add New Category</Text>
            </TouchableOpacity>
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

        {/* Advanced Customization Section */}
        <View style={[styles.toggleRow, { marginTop: 20, borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 20 }]}>
          <View>
            <Text style={styles.label}>Advanced Customization</Text>
            <Text style={styles.subLabel}>"Build Your Own" mode (e.g. Pizza toppings)</Text>
          </View>
          <Switch 
            value={isCustomizable} 
            onValueChange={setIsCustomizable}
            trackColor={{ false: Colors.border, true: Colors.primary + '40' }}
            thumbColor={isCustomizable ? Colors.primary : Colors.subText}
          />
        </View>

        {isCustomizable && (
          <View style={styles.customizationSection}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Customization Groups</Text>
              <TouchableOpacity onPress={addCustomizationGroup} style={styles.addButton}>
                <Ionicons name="add-circle" size={24} color={Colors.primary} />
                <Text style={styles.addButtonText}>Add Group</Text>
              </TouchableOpacity>
            </View>

            {customizationGroups.map((group, index) => (
              <View key={group.id} style={styles.groupCard}>
                <View style={styles.groupHeader}>
                  <Text style={styles.groupNumber}>Group #{index + 1}</Text>
                  <TouchableOpacity onPress={() => removeCustomizationGroup(group.id)}>
                    <Ionicons name="close-circle" size={24} color={Colors.error} />
                  </TouchableOpacity>
                </View>

                <TextInput 
                  style={styles.input} 
                  placeholder="Group Name (e.g. Choose Your Base)" 
                  value={group.name} 
                  onChangeText={(text) => updateCustomizationGroup(group.id, { name: text })} 
                />

                <View style={styles.groupSettings}>
                  <View style={styles.settingItem}>
                    <Text style={styles.settingLabel}>Required?</Text>
                    <Switch 
                      value={group.isRequired} 
                      onValueChange={(val) => updateCustomizationGroup(group.id, { isRequired: val })} 
                    />
                  </View>
                  <View style={styles.settingItem}>
                    <Text style={styles.settingLabel}>Multi-select?</Text>
                    <Switch 
                      value={group.selectionType === 'MULTIPLE'} 
                      onValueChange={(val) => updateCustomizationGroup(group.id, { selectionType: val ? 'MULTIPLE' : 'SINGLE' })} 
                    />
                  </View>
                </View>

                {group.selectionType === 'MULTIPLE' && (
                  <View style={styles.settingItem}>
                    <Text style={styles.settingLabel}>Max Selections</Text>
                    <TextInput 
                      style={[styles.input, { width: 60, textAlign: 'center' }]} 
                      keyboardType="numeric"
                      value={group.maxSelections === undefined || group.maxSelections === null ? '' : group.maxSelections.toString()}
                      onChangeText={(text) => {
                        const val = text === '' ? null : parseInt(text);
                        updateCustomizationGroup(group.id, { maxSelections: isNaN(val) ? null : val });
                      }}
                    />
                  </View>
                )}

                <View style={styles.optionsList}>
                  <Text style={styles.optionsTitle}>Options</Text>
                  {group.options.map((opt) => (
                    <View key={opt.id} style={styles.optionCard}>
                      <View style={styles.optionRow}>
                        <TextInput 
                          style={[styles.input, { flex: 2, marginRight: 8 }]} 
                          placeholder="Option Name" 
                          value={opt.name} 
                          onChangeText={(text) => updateOptionInGroup(group.id, opt.id, { name: text })} 
                        />
                        <TextInput 
                          style={[styles.input, { flex: 1, marginRight: 8 }]} 
                          placeholder="+₹ Price" 
                          keyboardType="numeric"
                          value={opt.priceModifier?.toString()} 
                          onChangeText={(text) => updateOptionInGroup(group.id, opt.id, { priceModifier: parseFloat(text) || 0 })} 
                        />
                        <TouchableOpacity onPress={() => removeOptionFromGroup(group.id, opt.id)}>
                          <Ionicons name="remove-circle-outline" size={24} color={Colors.error} />
                        </TouchableOpacity>
                      </View>
                      
                      <View style={styles.optionExtras}>
                        <View style={styles.settingItem}>
                          <Text style={styles.extraLabel}>Allow Qty?</Text>
                          <Switch 
                            value={opt.allowQuantity} 
                            onValueChange={(val) => updateOptionInGroup(group.id, opt.id, { allowQuantity: val })} 
                          />
                        </View>
                        {opt.allowQuantity && (
                          <View style={styles.settingItem}>
                            <Text style={styles.extraLabel}>Free Limit</Text>
                            <TextInput 
                              style={[styles.input, { width: 50, padding: 4, textAlign: 'center' }]} 
                              keyboardType="numeric"
                              value={opt.freeLimit?.toString()}
                              onChangeText={(text) => updateOptionInGroup(group.id, opt.id, { freeLimit: parseInt(text) || 0 })}
                            />
                          </View>
                        )}
                      </View>

                      <View style={{ marginTop: 8, paddingHorizontal: 4 }}>
                        <Text style={[styles.extraLabel, { marginBottom: 4 }]}>Conflicts with (names, comma separated):</Text>
                        <TextInput 
                          style={[styles.input, { height: 35, fontSize: 12, backgroundColor: Colors.white }]} 
                          placeholder="e.g. Milk, Tea" 
                          value={Array.isArray(opt.conflicts) ? opt.conflicts.join(', ') : ''} 
                          onChangeText={(text) => {
                            const list = text.split(',').map(s => s.trim()).filter(s => !!s);
                            updateOptionInGroup(group.id, opt.id, { conflicts: list });
                          }} 
                        />
                      </View>
                    </View>
                  ))}
                  <TouchableOpacity onPress={() => addOptionToGroup(group.id)} style={styles.addOptionButton}>
                    <Ionicons name="add" size={20} color={Colors.primary} />
                    <Text style={styles.addOptionText}>Add Option</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}

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
  },
  customizationSection: {
    marginTop: 10,
  },
  groupCard: {
    backgroundColor: Colors.grey,
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  groupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  groupNumber: {
    fontSize: 14,
    fontWeight: 'bold',
    color: Colors.subText,
  },
  groupSettings: {
    flexDirection: 'row',
    marginTop: 12,
    justifyContent: 'space-between',
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  settingLabel: {
    fontSize: 14,
    color: Colors.black,
    marginRight: 8,
  },
  optionsList: {
    marginTop: 20,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 16,
  },
  optionsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.black,
    marginBottom: 12,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  addOptionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    padding: 8,
  },
  addOptionText: {
    color: Colors.primary,
    fontWeight: '600',
    marginLeft: 4,
  },
  verticalPicker: {
    marginTop: 10,
  },
  categoryGroup: {
    marginBottom: 8,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: Colors.grey,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  categoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    backgroundColor: Colors.white,
  },
  activeCategoryHeader: {
    backgroundColor: Colors.primary,
  },
  categoryHeaderText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.black,
  },
  activeCategoryHeaderText: {
    color: Colors.white,
  },
  templateList: {
    padding: 10,
    backgroundColor: Colors.grey,
  },
  templateItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border + '40',
  },
  templateItemText: {
    fontSize: 14,
    color: Colors.black,
    marginLeft: 8,
  },
  optionCard: {
    backgroundColor: Colors.white,
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  optionExtras: {
    flexDirection: 'row',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.border + '40',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  extraLabel: {
    fontSize: 12,
    color: Colors.subText,
    marginRight: 6,
  }
});
