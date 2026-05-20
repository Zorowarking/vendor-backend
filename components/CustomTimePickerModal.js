import React, { useState, useEffect, useRef } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  Modal, 
  TextInput, 
  TouchableOpacity, 
  KeyboardAvoidingView, 
  Platform,
  TouchableWithoutFeedback,
  Keyboard
} from 'react-native';
import Colors from '../constants/Colors';

export default function CustomTimePickerModal({ visible, title, initialTime, onClose, onSave }) {
  const [hour, setHour] = useState('09');
  const [minute, setMinute] = useState('00');
  const [ampm, setAmpm] = useState('AM');

  const hourRef = useRef(null);
  const minuteRef = useRef(null);

  // Parse initial 24h time ("HH:MM") to 12h representation on modal open
  useEffect(() => {
    if (visible && initialTime) {
      const [hStr, mStr] = initialTime.split(':');
      let hVal = parseInt(hStr, 10) || 12;
      const mVal = mStr || '00';
      const ampmVal = hVal >= 12 ? 'PM' : 'AM';
      
      hVal = hVal % 12;
      hVal = hVal ? hVal : 12; // 0 becomes 12

      setHour(hVal.toString().padStart(2, '0'));
      setMinute(mVal);
      setAmpm(ampmVal);
    }
  }, [visible, initialTime]);

  const handleHourChange = (val) => {
    // Keep only numbers
    const clean = val.replace(/[^0-9]/g, '');
    setHour(clean);

    // Auto-advance to minute input if 2 digits are entered
    if (clean.length === 2) {
      let num = parseInt(clean, 10);
      if (num > 12) {
        setHour('12');
      } else if (num === 0) {
        setHour('12');
      }
      minuteRef.current?.focus();
    }
  };

  const handleHourBlur = () => {
    let num = parseInt(hour, 10);
    if (isNaN(num) || num < 1) {
      setHour('12');
    } else if (num > 12) {
      setHour('12');
    } else {
      setHour(num.toString().padStart(2, '0'));
    }
  };

  const handleMinuteChange = (val) => {
    const clean = val.replace(/[^0-9]/g, '');
    setMinute(clean);

    if (clean.length === 2) {
      let num = parseInt(clean, 10);
      if (num > 59) {
        setMinute('59');
      }
    }
  };

  const handleMinuteBlur = () => {
    let num = parseInt(minute, 10);
    if (isNaN(num) || num < 0) {
      setMinute('00');
    } else if (num > 59) {
      setMinute('59');
    } else {
      setMinute(num.toString().padStart(2, '0'));
    }
  };

  const handleSave = () => {
    let hNum = parseInt(hour, 10);
    let mNum = parseInt(minute, 10);

    if (isNaN(hNum) || hNum < 1 || hNum > 12) hNum = 12;
    if (isNaN(mNum) || mNum < 0 || mNum > 59) mNum = 0;

    // Convert to 24 hour string
    let finalHour = hNum;
    if (ampm === 'PM' && hNum < 12) {
      finalHour += 12;
    } else if (ampm === 'AM' && hNum === 12) {
      finalHour = 0;
    }

    const h24Str = finalHour.toString().padStart(2, '0');
    const m24Str = mNum.toString().padStart(2, '0');
    onSave(`${h24Str}:${m24Str}`);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={styles.overlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.keyboardView}
          >
            <View style={styles.card}>
              <Text style={styles.title}>{title || 'Set Time'}</Text>
              
              <View style={styles.pickerRow}>
                {/* Hour Input */}
                <View style={styles.inputContainer}>
                  <Text style={styles.inputLabel}>HH</Text>
                  <TextInput
                    ref={hourRef}
                    style={styles.input}
                    value={hour}
                    onChangeText={handleHourChange}
                    onBlur={handleHourBlur}
                    keyboardType="number-pad"
                    maxLength={2}
                    placeholder="09"
                    placeholderTextColor={Colors.darkGrey}
                    selectTextOnFocus
                  />
                </View>

                <Text style={styles.colon}>:</Text>

                {/* Minute Input */}
                <View style={styles.inputContainer}>
                  <Text style={styles.inputLabel}>MM</Text>
                  <TextInput
                    ref={minuteRef}
                    style={styles.input}
                    value={minute}
                    onChangeText={handleMinuteChange}
                    onBlur={handleMinuteBlur}
                    keyboardType="number-pad"
                    maxLength={2}
                    placeholder="00"
                    placeholderTextColor={Colors.darkGrey}
                    selectTextOnFocus
                  />
                </View>

                {/* AM/PM Toggle Chips */}
                <View style={styles.ampmContainer}>
                  <TouchableOpacity 
                    style={[styles.ampmButton, ampm === 'AM' && styles.ampmActiveButton]}
                    onPress={() => setAmpm('AM')}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.ampmText, ampm === 'AM' && styles.ampmActiveText]}>AM</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={[styles.ampmButton, ampm === 'PM' && styles.ampmActiveButton, { marginTop: 8 }]}
                    onPress={() => setAmpm('PM')}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.ampmText, ampm === 'PM' && styles.ampmActiveText]}>PM</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.actions}>
                <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
                  <Text style={styles.cancelText}>CANCEL</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
                  <Text style={styles.saveText}>OK</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  keyboardView: {
    width: '85%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    width: '100%',
    backgroundColor: Colors.white,
    borderRadius: 20,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 24,
    textAlign: 'center',
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  inputContainer: {
    alignItems: 'center',
  },
  inputLabel: {
    fontSize: 11,
    color: Colors.subText,
    fontWeight: 'bold',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  input: {
    width: 70,
    height: 70,
    borderWidth: 2,
    borderColor: Colors.border,
    borderRadius: 14,
    textAlign: 'center',
    fontSize: 28,
    fontWeight: 'bold',
    color: Colors.text,
    backgroundColor: Colors.grey,
  },
  colon: {
    fontSize: 36,
    fontWeight: 'bold',
    color: Colors.text,
    marginHorizontal: 12,
    marginTop: 18,
  },
  ampmContainer: {
    marginLeft: 20,
    justifyContent: 'center',
    marginTop: 18,
  },
  ampmButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.grey,
    alignItems: 'center',
    minWidth: 55,
  },
  ampmActiveButton: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  ampmText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: Colors.subText,
  },
  ampmActiveText: {
    color: Colors.white,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 16,
  },
  cancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginRight: 8,
  },
  cancelText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: Colors.subText,
  },
  saveBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: Colors.primary,
  },
  saveText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: Colors.white,
  },
});
