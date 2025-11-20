import React from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity, ScrollView, Dimensions } from 'react-native';

const { height } = Dimensions.get('window');

interface TermsAndConditionsModalProps {
  visible: boolean;
  onClose: () => void;
}

const TERMS_TEXT = `
Wayfarian Terms and Conditions

1. Acceptance of Terms
By creating an account or signing in, you agree to be bound by these Terms and Conditions and our Privacy Policy. If you do not agree, do not use the app.

2. User Accounts
You are responsible for maintaining the confidentiality of your account credentials. You agree not to share your account or allow others to access it.

3. User Content
You retain ownership of content you submit, but grant Wayfarian a license to use, display, and distribute it as part of the service. You must not post illegal, harmful, or offensive content.

4. Location Data
Wayfarian collects and uses your location data to provide journey tracking and group features. You consent to this use by using the app.

5. Prohibited Conduct
You agree not to misuse the app, attempt unauthorized access, or disrupt service for others.

6. Disclaimer
Wayfarian is provided "as is" without warranties of any kind. We are not liable for damages or losses resulting from use of the app.

7. Termination
We may suspend or terminate your account for violations of these terms or misuse of the app.

8. Changes to Terms
We may update these Terms and Conditions at any time. Continued use of the app means you accept the new terms.

9. Contact
For questions, contact support@wayfarian.app
`;

const TermsAndConditionsModal: React.FC<TermsAndConditionsModalProps> = ({ visible, onClose }) => {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modalContainer}>
          <View style={styles.handle} />
          <ScrollView contentContainerStyle={styles.contentContainer}>
            <Text style={styles.title}>Terms and Conditions</Text>
            <Text style={styles.termsText}>{TERMS_TEXT}</Text>
          </ScrollView>
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeButtonText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    minHeight: height * 0.5,
    maxHeight: height * 0.85,
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 8,
  },
  handle: {
    width: 48,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#ccc',
    alignSelf: 'center',
    marginBottom: 12,
  },
  contentContainer: {
    paddingBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
    textAlign: 'center',
  },
  termsText: {
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
    marginBottom: 16,
  },
  closeButton: {
    backgroundColor: '#2196F3',
    borderRadius: 16,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 8,
  },
  closeButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
});

export default TermsAndConditionsModal;
