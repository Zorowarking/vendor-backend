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
  Modal,
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
  const [selectedCategories, setSelectedCategories] = useState([]);
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
  const [categories, setCategories] = useState([]);
  const [types, setTypes] = useState(['Veg', 'Non-Veg', 'Vegan', 'Egg']);
  const [allTemplates, setAllTemplates] = useState([]);
  const [assignedByoTemplate, setAssignedByoTemplate] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      const [templatesResult, categoriesResult, assignedByoResult] = await Promise.allSettled([
        vendorApi.getTemplates(),
        vendorApi.getCategoryList(),
        vendorApi.getByoAssigned()
      ]);

      if (templatesResult.status === 'fulfilled') {
        const data = templatesResult.value;
        if (data?.success && data.templates) setAllTemplates(data.templates);
      }

      if (categoriesResult.status === 'fulfilled') {
        const data = categoriesResult.value;
        if (data?.success && data.categories) setCategories(data.categories);
      }

      if (assignedByoResult.status === 'fulfilled') {
        const data = assignedByoResult.value;
        if (data?.success && data.template) {
          setAssignedByoTemplate(data.template);
        }
      }
    };
    fetchData();
  }, []);

  const handleTemplateSelect = (template) => {
    setName(template.templateName);
    setSelectedCategories([template.category]);
    setTemplateId(template.id);

    if (template.isSkeletal) {
      // Skeletal templates provide structure, but can also include default options
      setPrice(''); 
      setDescription(template.templateData?.description || '');
      setType(template.templateData?.type || 'Veg');
      
      if (template.templateData?.customizationGroups) {
        setCustomizationGroups(template.templateData.customizationGroups.map(g => ({
          name: g.name,
          isRequired: g.isRequired || false,
          selectionType: g.selectionType || 'SINGLE',
          maxSelections: g.maxSelections || 1,
          id: Math.random().toString(),
          options: (g.options || []).map(o => ({
            ...o,
            id: Math.random().toString(),
            priceModifier: o.priceModifier || 0,
            allowQuantity: o.allowQuantity || false,
            freeLimit: o.freeLimit || 0
          }))
        })));
        setIsCustomizable(true);
      }
      return;
    }

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
      if (template.templateData.customizationGroups) {
        setCustomizationGroups(template.templateData.customizationGroups.map(g => ({
          ...g,
          id: Math.random().toString(),
          options: (g.options || []).map(o => ({
            ...o,
            id: Math.random().toString()
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

    if (selectedCategories.length === 0) {
      Alert.alert('Error', 'Please select at least one category');
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

      const finalType = type === 'New' ? newType : type;

      const productData = {
        name,
        description,
        price: parseFloat(price),
        category: selectedCategories, // Use the array of selected category IDs
        type: finalType,
        isRestricted,
        isAvailable,
        image: imageUrl,
        isCustomizable,
        customizationType: isCustomizable ? 'BUILD_YOUR_OWN' : 'NORMAL',
        customizationGroups: isCustomizable ? customizationGroups : [],
        addOns: addOns.map(a => ({
          name: a.name,
          price: a.price,
          freeLimit: a.freeLimit
        })),
        templateId
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

      Alert.alert(
        res.product?.reviewStatus === 'APPROVED' ? 'Success' : 'Submitted', 
        res.product?.reviewStatus === 'APPROVED' 
          ? 'Product added and activated successfully.' 
          : `Product submitted for review. It will be activated once approved by the admin.\n\nReason: ${res.reviewReason || 'Structural changes detected'}\nDebug: ${JSON.stringify(res.debug || {})}`, 
        [
          { 
            text: 'OK', 
            onPress: () => {
              // Clear form
              setName('');
              setDescription('');
              setPrice('');
              setSelectedCategories([]);
              setType('Veg');
              setAddOns([]);
              setIsCustomizable(false);
              setCustomizationGroups([]);
              setImage(null);
              setTemplateId(null);
              router.back();
            } 
          }
        ]
      );

    } catch (error) {
      console.error('Add Product Error:', error);
      const errorMsg = error.response?.data?.details || error.response?.data?.error || 'Failed to add product';
      Alert.alert('Error', errorMsg);
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
        <View style={styles.reviewHintBox}>
          <Ionicons name="information-circle-outline" size={18} color={Colors.primary} />
          <Text style={styles.reviewHintText}>
            Basic items (Name, Price, Category) go live instantly. Structural additions like add-ons or customizations will require Admin review.
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

        {/* ── New Category Modal (cross-platform) ── */}
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
                        setCategories(prev => [...prev, res.category]);
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
              {categories.map(cat => (
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
            <Text style={styles.addOnPrice}>+₹{item.price.toFixed(2)}</Text>
            <TouchableOpacity onPress={() => removeAddOn(item.id)}>
              <Ionicons name="trash-outline" size={20} color={Colors.error} />
            </TouchableOpacity>
          </View>
        ))}

        {/* Advanced Customization Section */}
        <View style={[styles.toggleRow, { marginTop: 20, borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 20 }]}>
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
                {templateId ? 'Admin Template (BYO)' : 'Customization Groups'}
              </Text>
            </View>

            {templateId && (
              <View style={styles.byoInfoBox}>
                <Ionicons name="shield-checkmark-outline" size={16} color={Colors.primary} />
                <Text style={styles.byoInfoText}>This structure is pre-defined by the Admin. You can add your items below.</Text>
              </View>
            )}

            {customizationGroups.map((group, index) => (
              <View key={group.id} style={styles.groupCard}>
                <View style={styles.groupHeader}>
                  <Text style={styles.groupNumber}>Group #{index + 1}</Text>
                  {!templateId && (
                    <TouchableOpacity onPress={() => removeCustomizationGroup(group.id)}>
                      <Ionicons name="close-circle" size={24} color={Colors.error} />
                    </TouchableOpacity>
                  )}
                </View>

                <TextInput 
                  style={[styles.input, templateId && styles.disabledInput]} 
                  placeholder="Group Name (e.g. Choose Your Base)" 
                  value={group.name} 
                  editable={!templateId}
                  onChangeText={(text) => updateCustomizationGroup(group.id, { name: text })} 
                />

                <View style={styles.groupSettings}>
                  <View style={styles.settingItem}>
                    <Text style={styles.settingLabel}>Required?</Text>
                    <Switch 
                      disabled={!!templateId}
                      value={group.isRequired} 
                      onValueChange={(val) => updateCustomizationGroup(group.id, { isRequired: val })} 
                    />
                  </View>
                  <View style={styles.settingItem}>
                    <Text style={styles.settingLabel}>Multi-select?</Text>
                    <Switch 
                      disabled={!!templateId}
                      value={group.selectionType === 'MULTIPLE'} 
                      onValueChange={(val) => updateCustomizationGroup(group.id, { selectionType: val ? 'MULTIPLE' : 'SINGLE' })} 
                    />
                  </View>
                </View>

                {group.selectionType === 'MULTIPLE' && (
                  <View style={styles.settingItem}>
                    <Text style={styles.settingLabel}>Max Selections</Text>
                    <TextInput 
                      style={[styles.input, { width: 60, textAlign: 'center' }, templateId && styles.disabledInput]} 
                      keyboardType="numeric"
                      editable={!templateId}
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
                      <View style={styles.optionHeader}>
                        <TextInput 
                          style={[styles.input, { flex: 2, marginRight: 8 }]} 
                          placeholder="Name (e.g. Grilled)" 
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
                          <Ionicons name="close-circle" size={24} color={Colors.error} />
                        </TouchableOpacity>
                      </View>

                      <View style={{ marginTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 20 }}>
                          <Text style={{ fontSize: 13, color: Colors.subText, marginRight: 8 }}>Allow Qty?</Text>
                          <Switch 
                            scaleX={0.9} scaleY={0.9}
                            value={opt.allowQuantity} 
                            onValueChange={(val) => updateOptionInGroup(group.id, opt.id, { allowQuantity: val })} 
                          />
                        </View>
                        {opt.allowQuantity && (
                          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <Text style={{ fontSize: 13, color: Colors.subText, marginRight: 8 }}>Free</Text>
                            <TextInput 
                              style={[styles.input, { width: 45, padding: 6, textAlign: 'center', fontSize: 13 }]} 
                              keyboardType="numeric"
                              value={opt.freeLimit?.toString()}
                              onChangeText={(text) => updateOptionInGroup(group.id, opt.id, { freeLimit: parseInt(text) || 0 })}
                            />
                          </View>
                        )}
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

            <TouchableOpacity 
              onPress={addCustomizationGroup} 
              style={[styles.addButton, { marginTop: 10, alignSelf: 'center', width: '100%', justifyContent: 'center' }]}
            >
              <Ionicons name="add-circle" size={24} color={Colors.primary} />
              <Text style={styles.addButtonText}>Add Group</Text>
            </TouchableOpacity>
          </View>
        )}

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
  disabledInput: {
    backgroundColor: Colors.border + '30',
    opacity: 0.7,
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
  templateChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: Colors.primary + '15',
    borderWidth: 1,
    borderColor: Colors.primary,
    marginRight: 8,
  },
  templateChipText: {
    fontSize: 12,
    color: Colors.primary,
    fontWeight: '600',
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
  activeChipTemplate: {
    backgroundColor: '#311b92',
    borderColor: '#311b92',
  },
  chipContainer: {
    marginTop: 4,
  },
  chipScroll: {
    paddingRight: 16,
  },
  emptyText: {
    fontSize: 12,
    color: '#999',
    fontStyle: 'italic',
    padding: 10,
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
  },
  byoToggleContainer: {
    flexDirection: 'row',
    backgroundColor: Colors.grey,
    borderRadius: 12,
    padding: 4,
    marginTop: 12,
    marginBottom: 8,
  },
  byoToggleButton: {
    flex: 1,
    flexDirection: 'row',
    paddingVertical: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
  },
  activeByoToggleButton: {
    backgroundColor: Colors.primary,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.41,
  },
  byoToggleText: {
    fontSize: 14,
    color: Colors.subText,
    fontWeight: '500',
  },
  activeByoToggleText: {
    color: Colors.white,
    fontWeight: '600',
  },
  categoryList: {
    marginTop: 10,
    backgroundColor: Colors.white,
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  categoryCheckbox: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.background,
  },
  activeCategoryCheckbox: {
    backgroundColor: Colors.primary + '10',
  },
  categoryText: {
    fontSize: 14,
    color: Colors.text,
    marginLeft: 10,
  },
  activeCategoryText: {
    color: Colors.primary,
    fontWeight: '600',
  },
  newCategoryContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
  },
  addCategoryIcon: {
    marginLeft: 10,
  },
  templateList: {
    marginTop: 10,
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
  saveButton: {
    backgroundColor: Colors.primary,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 20,
  },
  saveButtonText: {
    color: Colors.white,
    fontSize: 18,
    fontWeight: 'bold',
  },
  optionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  linkProductButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.primary + '40',
    alignSelf: 'flex-start',
    marginBottom: 10,
  },
  linkProductText: {
    fontSize: 12,
    color: Colors.primary,
    marginLeft: 4,
    fontWeight: '600',
  },
  conflictContainer: {
    marginTop: 10,
    padding: 10,
    backgroundColor: Colors.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  conflictLabel: {
    fontSize: 11,
    color: Colors.subText,
    marginBottom: 4,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  conflictInput: {
    backgroundColor: Colors.white,
    borderRadius: 6,
    padding: 8,
    fontSize: 13,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
    height: 40,
  },
  horizontalScroll: {
    marginTop: 10,
    paddingBottom: 5,
  },
  templateChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.primary + '30',
    marginRight: 10,
  },
  activeTemplateChip: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  templateChipText: {
    fontSize: 13,
    color: Colors.primary,
    marginLeft: 6,
    fontWeight: '500',
  },
  activeTemplateChipText: {
    color: Colors.white,
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 10,
  },
  categoryChip: {
    backgroundColor: Colors.white,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    marginRight: 8,
    marginBottom: 8,
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
    marginRight: 8,
    marginBottom: 8,
  },
  addChipText: {
    fontSize: 13,
    color: Colors.primary,
    marginLeft: 4,
    fontWeight: '500',
  },
  byoInfoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary + '10',
    padding: 12,
    borderRadius: 8,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: Colors.primary + '30',
  },
  byoInfoText: {
    fontSize: 12,
    color: Colors.primary,
    marginLeft: 8,
    flex: 1,
    fontWeight: '500',
  },
  optionTabHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
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
    fontSize: 13,
    color: Colors.subText,
    fontWeight: '500',
  },
  activeOptionTabText: {
    color: Colors.primary,
    fontWeight: 'bold',
  },
  optionTabContent: {
    paddingVertical: 8,
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
  // ── BYO Template Cards ──
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
  clearTemplateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    alignSelf: 'flex-start',
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
});
