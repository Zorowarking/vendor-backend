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
  Platform,
  Modal
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
  
  const REVIEW_TRIGGER_FIELDS = [
    'New Add-ons',
    'New Customization Groups',
    'New Options/Modifiers',
    'Product Type Change'
  ];

  
  // Form State
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
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
  const [showByoTemplates, setShowByoTemplates] = useState(false);
  const [showNewCategoryModal, setShowNewCategoryModal] = useState(false);
  const [newCategoryInput, setNewCategoryInput] = useState('');
  const [savingCategory, setSavingCategory] = useState(false);
  const [showNewTypeModal, setShowNewTypeModal] = useState(false);
  const [newTypeInput, setNewTypeInput] = useState('');
  
  // Add-on State
  const [addOnName, setAddOnName] = useState('');
  const [addOnPrice, setAddOnPrice] = useState('');
  const [addOnFreeLimit, setAddOnFreeLimit] = useState('0');
  const [showAddOnForm, setShowAddOnForm] = useState(false);

  // Categories and Types fetched from API
  const [availableCategories, setAvailableCategories] = useState([]);
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [types, setTypes] = useState(['Veg', 'Non-Veg', 'Vegan', 'Egg']);
  const [allTemplates, setAllTemplates] = useState([]);
  const [assignedByoTemplate, setAssignedByoTemplate] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      const [productsResult, templatesResult, catsResult, assignedByoResult] = await Promise.allSettled([
        vendorApi.getProducts(),
        vendorApi.getTemplates(),
        vendorApi.getCategoryList(),
        vendorApi.getByoAssigned()
      ]);

      if (catsResult.status === 'fulfilled') {
        const data = catsResult.value;
        if (data?.success && data.categories) setAvailableCategories(data.categories);
      }

      if (templatesResult.status === 'fulfilled') {
        const data = templatesResult.value;
        if (data?.success && data.templates) setAllTemplates(data.templates);
      }

      if (assignedByoResult.status === 'fulfilled') {
        const data = assignedByoResult.value;
        if (data?.success && data.template) {
          setAssignedByoTemplate(data.template);
        }
      }

      const products = productsResult.status === 'fulfilled' ? (Array.isArray(productsResult.value) ? productsResult.value : productsResult.value?.products || []) : [];
      const product = products.find(p => p.id === id);

      if (product) {
        setName(product.name);
        setDescription(product.description || '');
        setPrice((product.price || 0).toString());
        
        if (product.categories && product.categories.length > 0) {
          setSelectedCategories(product.categories.map(c => c.id));
        } else if (product.category) {
          // Fallback if backend returned a string for some reason, try to find the ID
          const catObj = availableCategories.find(c => c.name === product.category);
          if (catObj) setSelectedCategories([catObj.id]);
        }
        
        setType(product.type);
        setIsAvailable(product.isAvailable);
        setImage(product.image);
        setIsCustomizable(product.isCustomizable || false);
        setCustomizationGroups(product.customizationGroups || []);
        setAddOns(product.addOns || []);
        setTemplateId(product.templateId || null);
        if (product.templateId) setShowByoTemplates(true);
      } else if (productsResult.status === 'rejected') {
        Alert.alert('Error', 'Failed to fetch product data');
      }

      setLoading(false);
    };
    fetchData();
  }, [id, availableCategories.length]);

  const handleTemplateSelect = (template) => {
    setName(template.templateName);
    setTemplateId(template.id);
    
    // Auto-select category if template matches
    const matchedCat = availableCategories.find(c => c.name.toLowerCase() === template.category?.toLowerCase());
    if (matchedCat) setSelectedCategories([matchedCat.id]);

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

  const handleCreateType = () => {
    if (!newTypeInput.trim()) return;
    const cleanType = newTypeInput.trim();
    if (!types.includes(cleanType)) {
      setTypes(prev => [...prev, cleanType]);
    }
    setType(cleanType);
    setShowNewTypeModal(false);
    setNewTypeInput('');
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
            freeLimit: 0,
            conflicts: []
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

    if (selectedCategories.length === 0) {
      Alert.alert('Error', 'Please select a category');
      return;
    }

    setSaving(true);
    try {
      let imageUrl = image;
      if (image && !image.startsWith('http')) {
        const uploadResult = await vendorApi.uploadImage(image);
        imageUrl = uploadResult.url;
      }

      const productData = {
        name,
        description,
        price: parseFloat(price),
        category: selectedCategories,
        type,
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
      
      const { setProducts, products: currentProducts } = useVendorStore.getState();
      const updatedProducts = currentProducts.map(p => 
        p.id === id ? { ...p, ...res.product } : p
      );
      setProducts(updatedProducts);

      const message = res.reviewTriggered 
        ? 'Product details updated and submitted for review.'
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
      'Are you sure you want to delete this product?',
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
      <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.reviewHintBox}>
          <Ionicons name="information-circle-outline" size={18} color={Colors.primary} />
          <Text style={styles.reviewHintText}>
            Basic edits (Name, Price, Description) are instant. Adding new options or changing types will require Admin review.
          </Text>
        </View>

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

        {/* ── New Category Modal ── */}
        <Modal visible={showNewCategoryModal} transparent animationType="fade" onRequestClose={() => setShowNewCategoryModal(false)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalBox}>
              <Text style={styles.modalTitle}>New Category</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="e.g. Beverages, Snacks…"
                value={newCategoryInput}
                onChangeText={setNewCategoryInput}
                autoFocus
              />
              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.modalCancel} onPress={() => { setShowNewCategoryModal(false); setNewCategoryInput(''); }}>
                  <Text style={{ color: Colors.subText, fontWeight: '600' }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalConfirm, savingCategory && { opacity: 0.6 }]}
                  disabled={savingCategory}
                  onPress={async () => {
                    if (!newCategoryInput.trim()) return;
                    setSavingCategory(true);
                    try {
                      const res = await vendorApi.createCategory(newCategoryInput.trim());
                      if (res.success) {
                        setAvailableCategories(prev => [...prev, res.category]);
                        setSelectedCategories(prev => [...prev, res.category.id]);
                        setNewCategoryInput('');
                        setShowNewCategoryModal(false);
                      }
                    } catch (e) {
                      Alert.alert('Error', 'Could not create category');
                    } finally {
                      setSavingCategory(false);
                    }
                  }}
                >
                  {savingCategory ? <ActivityIndicator size="small" color={Colors.white} /> : <Text style={{ color: Colors.white, fontWeight: '700' }}>Create</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* New Type Modal */}
        <Modal visible={showNewTypeModal} transparent animationType="fade" onRequestClose={() => setShowNewTypeModal(false)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalBox}>
              <Text style={styles.modalTitle}>New Product Type</Text>
              <TextInput 
                style={styles.modalInput}
                placeholder="Type Name (e.g. Seafood)"
                value={newTypeInput}
                onChangeText={setNewTypeInput}
                autoFocus
              />
              <View style={styles.modalActions}>
                <TouchableOpacity 
                  style={styles.modalCancel} 
                  onPress={() => {
                    setShowNewTypeModal(false);
                    setNewTypeInput('');
                  }}
                >
                  <Text style={{ color: Colors.text }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={styles.modalConfirm}
                  onPress={handleCreateType}
                >
                  <Text style={{ color: Colors.white, fontWeight: '600' }}>Add Type</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        <View style={styles.section}>
          <Text style={styles.label}>{showByoTemplates ? 'Admin BYO Template' : 'Category'}</Text>
          <Text style={styles.subLabel}>
            {showByoTemplates
              ? 'Template & category are set by admin — not editable'
              : 'Select which category this product belongs to'}
          </Text>

          {/* Tab switcher */}
          <View style={styles.byoToggleContainer}>
            <TouchableOpacity
              style={[styles.byoToggleButton, !showByoTemplates && styles.activeByoToggleButton]}
              onPress={() => { 
                setShowByoTemplates(false); 
                setTemplateId(null); 
                setSelectedCategories([]); 
                setCustomizationGroups([]);
                setIsCustomizable(false);
              }}
            >
              <Text style={[styles.byoToggleText, !showByoTemplates && styles.activeByoToggleText]}>Regular Item</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.byoToggleButton, showByoTemplates && styles.activeByoToggleButton]}
              onPress={() => { 
                setShowByoTemplates(true); 
                setTemplateId(null); 
                setSelectedCategories([]); 
                setCustomizationGroups([]);
                setIsCustomizable(false);
              }}
            >
              <Ionicons name="construct-outline" size={14} color={showByoTemplates ? Colors.white : Colors.primary} style={{ marginRight: 4 }} />
              <Text style={[styles.byoToggleText, showByoTemplates && styles.activeByoToggleText]}>Admin BYO</Text>
            </TouchableOpacity>
          </View>

          {showByoTemplates ? (
            /* ── ADMIN BYO: Single Assigned Template ── */
            <View>
              {!assignedByoTemplate ? (
                <View style={styles.byoInfoBox}>
                  <Ionicons name="information-circle-outline" size={20} color={Colors.subText} />
                  <Text style={[styles.byoInfoText, { color: Colors.subText }]}>No BYO template assigned by admin yet.</Text>
                </View>
              ) : (
                <View>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    style={[
                      styles.byoTemplateCard,
                      templateId === assignedByoTemplate.id && styles.byoTemplateCardActive
                    ]}
                    onPress={() => {
                      setTemplateId(assignedByoTemplate.id);
                      setName(assignedByoTemplate.name);
                      setSelectedCategories([assignedByoTemplate.category]); 
                      setIsCustomizable(true);
                      
                      if (assignedByoTemplate.byo_template_groups) {
                        setCustomizationGroups(assignedByoTemplate.byo_template_groups.map(g => ({
                          id: Math.random().toString(),
                          name: g.name,
                          isRequired: g.is_required,
                          selectionType: g.selection_type,
                          maxSelections: g.max_limit || 1,
                          options: [] 
                        })));
                      }
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                      <Ionicons
                        name="construct-outline"
                        size={18}
                        color={templateId === assignedByoTemplate.id ? Colors.primary : Colors.subText}
                        style={{ marginRight: 10 }}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.byoTemplateName, templateId === assignedByoTemplate.id && { color: Colors.primary }]}>
                          {assignedByoTemplate.name}
                        </Text>
                        <View style={styles.byoCategoryBadge}>
                          <Ionicons name="lock-closed-outline" size={10} color={Colors.subText} style={{ marginRight: 3 }} />
                          <Text style={styles.byoCategoryBadgeText}>{assignedByoTemplate.category}</Text>
                        </View>
                      </View>
                    </View>
                    {templateId === assignedByoTemplate.id && (
                      <Ionicons name="checkmark-circle" size={20} color={Colors.primary} />
                    )}
                  </TouchableOpacity>

                  {/* Locked Category Display */}
                  <View style={[styles.byoInfoBox, { marginTop: 12 }]}>
                    <Ionicons name="pricetag-outline" size={16} color={Colors.primary} />
                    <Text style={styles.byoInfoText}>
                      Assigned Category: <Text style={{ fontWeight: 'bold' }}>{assignedByoTemplate.category}</Text>
                    </Text>
                  </View>
                </View>
              )}
            </View>
          ) : (
            /* ── REGULAR: Selectable category chips + + New button ── */
            <View style={styles.chipGrid}>
              {availableCategories.map(cat => (
                <TouchableOpacity
                  key={cat.id}
                  style={[styles.categoryChip, selectedCategories.includes(cat.id) && styles.activeCategoryChip]}
                  onPress={() => {
                    setSelectedCategories(prev =>
                      prev.includes(cat.id) ? prev.filter(id => id !== cat.id) : [...prev, cat.id]
                    );
                  }}
                >
                  <Text style={[styles.categoryChipText, selectedCategories.includes(cat.id) && styles.activeCategoryChipText]}>
                    {cat.name}
                  </Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity style={styles.addChipButton} onPress={() => setShowNewCategoryModal(true)}>
                <Ionicons name="add" size={16} color={Colors.primary} />
                <Text style={styles.addChipText}>New</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Quick Templates</Text>
          <Text style={styles.subLabel}>Auto-fill details from system templates</Text>
          <View style={styles.chipContainer}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipScroll}>
              {allTemplates.map(t => (
                <TouchableOpacity 
                  key={t.id} 
                  style={[styles.chip, templateId === t.id && styles.activeChipTemplate]}
                  onPress={() => handleTemplateSelect(t)}
                >
                  <Ionicons 
                    name="flash" 
                    size={14} 
                    color={templateId === t.id ? Colors.white : Colors.primary} 
                    style={{ marginRight: 4 }} 
                  />
                  <Text style={[styles.chipText, templateId === t.id && styles.activeChipText]}>{t.templateName}</Text>
                </TouchableOpacity>
              ))}
              {allTemplates.length === 0 && <Text style={styles.emptyText}>No templates found</Text>}
            </ScrollView>
          </View>
        </View>

        <View style={styles.row}>
          <View style={[styles.section, { flex: 1, marginRight: 8 }]}>
            <Text style={styles.label}>Base Price (₹) *</Text>
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
                style={styles.chip}
                onPress={() => setShowNewTypeModal(true)}
              >
                <Text style={styles.chipText}>+ New</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
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
                  <Text style={styles.tinyLabel}>Price (₹)</Text>
                  <TextInput 
                    style={styles.input} 
                    placeholder="Price" 
                    keyboardType="numeric"
                    value={addOnPrice} 
                    onChangeText={setAddOnPrice} 
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.tinyLabel}>Free Limit</Text>
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
            <View style={styles.formActions}>
              <TouchableOpacity onPress={addAddOn} style={styles.saveAddOnButton}>
                <Ionicons name="checkmark" size={24} color={Colors.white} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowAddOnForm(false)} style={styles.cancelAddOnButton}>
                <Ionicons name="close" size={24} color={Colors.white} />
              </TouchableOpacity>
            </View>
          </View>
        )}

        <View style={styles.listContainer}>
          {addOns.map(item => (
            <View key={item.id} style={styles.addOnListItem}>
              <View style={{ flex: 1 }}>
                <Text style={styles.addOnName}>{item.name}</Text>
                {item.freeLimit > 0 && (
                  <Text style={styles.freeLimitText}>First {item.freeLimit} units free</Text>
                )}
              </View>
              <Text style={styles.addOnPrice}>+₹{Number(item.price || 0).toFixed(2)}</Text>
              <TouchableOpacity onPress={() => removeAddOn(item.id)} style={styles.removeBtn}>
                <Ionicons name="trash-outline" size={18} color={Colors.error} />
              </TouchableOpacity>
            </View>
          ))}
        </View>

        {/* Advanced Customization Section */}
        <View style={styles.customHeader}>
          <View>
            <Text style={styles.label}>Advanced Customization</Text>
            <Text style={styles.subLabel}>Enable extra options and groups for this product</Text>
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
              <Text style={styles.sectionTitle}>
                {templateId ? 'Admin Template (BYO)' : 'Options Groups'}
              </Text>
            </View>

            {templateId && (
              <View style={styles.byoInfoBox}>
                <Ionicons name="shield-checkmark-outline" size={16} color={Colors.primary} />
                <Text style={styles.byoInfoText}>This structure is pre-defined by the Admin. You can manage your items below.</Text>
              </View>
            )}

            {customizationGroups.map((group, index) => (
              <View key={group.id} style={styles.groupCard}>
                <View style={styles.groupHeader}>
                  <View style={styles.groupBadge}>
                    <Text style={styles.groupBadgeText}>Group #{index + 1}</Text>
                  </View>
                  {!templateId && (
                    <TouchableOpacity onPress={() => removeCustomizationGroup(group.id)}>
                      <Ionicons name="close-circle" size={22} color={Colors.error} />
                    </TouchableOpacity>
                  )}
                </View>

                <TextInput 
                  style={[styles.input, { marginBottom: 12, fontWeight: '500' }, templateId && styles.disabledInput]} 
                  placeholder="Group Title (e.g. Extra Toppings)" 
                  value={group.name} 
                  editable={!templateId}
                  onChangeText={(text) => updateCustomizationGroup(group.id, { name: text })} 
                />

                <View style={styles.groupControls}>
                  <TouchableOpacity 
                    disabled={!!templateId}
                    style={[styles.controlBtn, group.isRequired && styles.activeControl, templateId && { opacity: 0.8 }]}
                    onPress={() => updateCustomizationGroup(group.id, { isRequired: !group.isRequired })}
                  >
                    <Ionicons name={group.isRequired ? "checkbox" : "square-outline"} size={18} color={group.isRequired ? Colors.primary : Colors.subText} />
                    <Text style={[styles.controlText, group.isRequired && styles.activeControlText]}>Required</Text>
                  </TouchableOpacity>

                  <TouchableOpacity 
                    disabled={!!templateId}
                    style={[styles.controlBtn, group.selectionType === 'MULTIPLE' && styles.activeControl, templateId && { opacity: 0.8 }]}
                    onPress={() => updateCustomizationGroup(group.id, { selectionType: group.selectionType === 'MULTIPLE' ? 'SINGLE' : 'MULTIPLE' })}
                  >
                    <Ionicons name={group.selectionType === 'MULTIPLE' ? "layers" : "stop-outline"} size={18} color={group.selectionType === 'MULTIPLE' ? Colors.primary : Colors.subText} />
                    <Text style={[styles.controlText, group.selectionType === 'MULTIPLE' && styles.activeControlText]}>Multi-select</Text>
                  </TouchableOpacity>
                </View>

                {group.selectionType === 'MULTIPLE' && (
                  <View style={styles.maxSelectContainer}>
                    <Text style={styles.tinyLabel}>Max Selections (0 for unlimited)</Text>
                    <TextInput 
                      style={[styles.input, { width: '30%', textAlign: 'center', marginTop: 4 }]} 
                      keyboardType="numeric"
                      value={group.maxSelections?.toString()}
                      onChangeText={(text) => updateCustomizationGroup(group.id, { maxSelections: parseInt(text) || 0 })}
                    />
                  </View>
                )}

                <View style={styles.optionsArea}>
                  {group.options.map((opt) => (
                    <View key={opt.id} style={styles.optionRowWrapper}>
                      <View style={styles.optionMain}>
                        <TextInput 
                          style={[styles.input, { flex: 2, marginRight: 8 }]} 
                          placeholder="Option Name" 
                          value={opt.name} 
                          onChangeText={(text) => updateOptionInGroup(group.id, opt.id, { name: text })} 
                        />
                        <TextInput 
                          style={[styles.input, { flex: 1, marginRight: 8 }]} 
                          placeholder="+₹ 0" 
                          keyboardType="numeric"
                          value={opt.priceModifier?.toString()} 
                          onChangeText={(text) => updateOptionInGroup(group.id, opt.id, { priceModifier: parseFloat(text) || 0 })} 
                        />
                        <TouchableOpacity onPress={() => removeOptionFromGroup(group.id, opt.id)}>
                          <Ionicons name="trash-outline" size={20} color={Colors.error} />
                        </TouchableOpacity>
                      </View>
                      
                      <View style={{ marginTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 15 }}>
                            <Text style={{ fontSize: 12, color: Colors.subText, marginRight: 5 }}>Allow Qty?</Text>
                            <Switch 
                              scaleX={0.8} scaleY={0.8}
                              value={opt.allowQuantity} 
                              onValueChange={(val) => updateOptionInGroup(group.id, opt.id, { allowQuantity: val })} 
                            />
                          </View>
                          {opt.allowQuantity && (
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                              <Text style={{ fontSize: 12, color: Colors.subText, marginRight: 5 }}>Free</Text>
                              <TextInput 
                                style={[styles.input, { width: 40, padding: 4, textAlign: 'center', fontSize: 12 }]} 
                                keyboardType="numeric"
                                value={opt.freeLimit?.toString()}
                                onChangeText={(text) => updateOptionInGroup(group.id, opt.id, { freeLimit: parseInt(text) || 0 })}
                              />
                            </View>
                          )}
                        </View>
                      </View>
                    </View>
                  ))}
                  
                  <TouchableOpacity onPress={() => addOptionToGroup(group.id)} style={styles.addOptBtn}>
                    <Ionicons name="add" size={18} color={Colors.primary} />
                    <Text style={styles.addOptText}>Add Option</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}

            <TouchableOpacity 
              onPress={addCustomizationGroup} 
              style={[styles.addGroupBtn, { marginTop: 15, width: '100%', justifyContent: 'center' }]}
            >
              <Ionicons name="add" size={20} color={Colors.white} />
              <Text style={styles.addGroupBtnText}>New Group</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.footer}>
          <TouchableOpacity 
            style={[styles.saveBtn, saving && styles.disabledBtn]} 
            onPress={handleSave}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color={Colors.white} />
            ) : (
              <Text style={styles.saveBtnText}>Update Product</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.delBtn} onPress={handleDelete}>
            <Text style={styles.delBtnText}>Delete Permanently</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff'
  },
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  reviewHintBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary + '10',
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.primary + '20',
  },
  reviewHintText: {
    fontSize: 12,
    color: Colors.primary,
    marginLeft: 8,
    flex: 1,
    fontWeight: '500',
    lineHeight: 16,
  },
  section: {
    marginBottom: 20,
    backgroundColor: Colors.white,
    padding: 16,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  label: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 8,
  },
  subLabel: {
    fontSize: 12,
    color: Colors.subText,
    marginBottom: 12,
  },
  input: {
    backgroundColor: '#f8f9fa',
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    color: Colors.text,
    borderWidth: 1,
    borderColor: '#eee',
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  row: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  imagePicker: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#f0f0f0',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  imagePlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    marginTop: 8,
    color: '#999',
    fontSize: 14,
  },
  selectedImage: {
    width: '100%',
    height: '100%',
  },
  chipContainer: {
    marginTop: 4,
  },
  chipScroll: {
    paddingRight: 16,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#eee',
    marginRight: 8,
  },
  activeChip: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  activeChipTemplate: {
    backgroundColor: '#311b92',
    borderColor: '#311b92',
  },
  chipText: {
    fontSize: 13,
    color: '#666',
    fontWeight: '500',
  },
  activeChipText: {
    color: '#fff',
  },
  emptyText: {
    fontSize: 12,
    color: '#999',
    fontStyle: 'italic',
    padding: 10,
  },
  typeContainer: {
    flexDirection: 'row',
    backgroundColor: '#f8f9fa',
    padding: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#eee',
  },
  typeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 8,
  },
  activeVeg: {
    backgroundColor: '#e8f5e9',
  },
  activeNonVeg: {
    backgroundColor: '#ffebee',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  typeText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
  },
  activeTypeText: {
    color: '#1a1a1a',
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
    elevation: 2,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  addButtonText: {
    marginLeft: 4,
    fontSize: 13,
    fontWeight: '600',
    color: Colors.primary,
  },
  addOnForm: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 16,
    marginBottom: 16,
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: Colors.primary + '30',
  },
  formActions: {
    marginLeft: 12,
    justifyContent: 'center',
  },
  saveAddOnButton: {
    backgroundColor: Colors.success,
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  cancelAddOnButton: {
    backgroundColor: '#666',
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addOnListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#eee',
  },
  addOnName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  addOnPrice: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.primary,
    marginRight: 12,
  },
  freeLimitText: {
    fontSize: 11,
    color: Colors.success,
    marginTop: 2,
  },
  removeBtn: {
    padding: 4,
  },
  customHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 16,
    marginTop: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: Colors.primary + '20',
  },
  addGroupBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  addGroupBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    marginLeft: 4,
  },
  groupCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#eee',
  },
  groupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  groupBadge: {
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  groupBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#666',
    textTransform: 'uppercase',
  },
  groupControls: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  controlBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    marginRight: 10,
    borderWidth: 1,
    borderColor: '#eee',
  },
  activeControl: {
    backgroundColor: Colors.primary + '10',
    borderColor: Colors.primary + '30',
  },
  controlText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    marginLeft: 6,
  },
  activeControlText: {
    color: Colors.primary,
  },
  optionRowWrapper: {
    backgroundColor: '#fcfcfc',
    borderRadius: 12,
    padding: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#f0f0f0',
  },
  optionMain: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  optionSubSettings: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  subSettingBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginRight: 15,
    borderWidth: 1,
    borderColor: '#eee',
  },
  activeSubSetting: {
    backgroundColor: Colors.success + '10',
    borderColor: Colors.success + '30',
  },
  subSettingText: {
    fontSize: 11,
    color: '#666',
    marginLeft: 6,
    fontWeight: '600',
  },
  activeSubSettingText: {
    color: Colors.success,
  },
  miniInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#eee',
  },
  miniLabel: {
    fontSize: 10,
    color: '#999',
    marginRight: 4,
    fontWeight: '600',
  },
  miniInput: {
    width: 35,
    height: 24,
    fontSize: 11,
    color: '#1a1a1a',
    textAlign: 'center',
    padding: 0,
  },
  conflictArea: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  conflictInput: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 10,
    fontSize: 12,
    color: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#eee',
    marginTop: 4,
  },
  addOptBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
    borderStyle: 'dashed',
    borderWidth: 1,
    borderColor: Colors.primary,
    borderRadius: 10,
    marginTop: 5,
  },
  addOptText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.primary,
    marginLeft: 4,
  },
  footer: {
    marginTop: 20,
  },
  saveBtn: {
    backgroundColor: Colors.primary,
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  saveBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  delBtn: {
    marginTop: 15,
    paddingVertical: 12,
    alignItems: 'center',
  },
  delBtnText: {
    color: Colors.error,
    fontSize: 14,
    fontWeight: '600',
  },
  tinyLabel: {
    fontSize: 10,
    color: '#999',
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  optionTabHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    marginBottom: 10,
    marginTop: 10,
  },
  optionTab: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginRight: 8,
  },
  activeOptionTab: {
    borderBottomWidth: 2,
    borderBottomColor: Colors.primary,
  },
  optionTabText: {
    fontSize: 12,
    color: '#999',
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  activeOptionTabText: {
    color: Colors.primary,
  },
  optionTabContent: {
    paddingBottom: 8,
  },
  disabledInput: {
    backgroundColor: Colors.border + '30',
    opacity: 0.7,
  },
  // ── New Category Modal ──
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  modalBox: {
    width: '100%',
    backgroundColor: Colors.white,
    borderRadius: 14,
    padding: 20,
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 14,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: Colors.text,
    marginBottom: 16,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  modalCancel: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: Colors.border,
  },
  modalConfirm: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: Colors.primary,
    minWidth: 80,
    alignItems: 'center',
  },
  // ── BYO Toggle ──
  byoToggleContainer: {
    flexDirection: 'row',
    backgroundColor: '#f1f1f1',
    borderRadius: 10,
    padding: 4,
    marginBottom: 15,
  },
  byoToggleButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 8,
  },
  activeByoToggleButton: {
    backgroundColor: Colors.white,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  byoToggleText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.subText,
  },
  activeByoToggleText: {
    color: Colors.primary,
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  activeCategoryChip: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  categoryChipText: {
    fontSize: 13,
    color: Colors.text,
  },
  activeCategoryChipText: {
    color: Colors.white,
    fontWeight: '600',
  },
  addChipButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: Colors.primary,
  },
  addChipText: {
    fontSize: 13,
    color: Colors.primary,
    marginLeft: 4,
    fontWeight: '500',
  },
  byoTemplateCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 13,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.white,
    marginTop: 8,
  },
  byoTemplateCardActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + '08',
  },
  byoTemplateName: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
  },
  byoCategoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
  },
  byoCategoryBadgeText: {
    fontSize: 11,
    color: Colors.subText,
  },
  pickerContainer: {
    marginTop: 4,
  },
});
