import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

export type AlertType = 'success' | 'error' | 'warning' | 'info' | 'confirm';

export interface AlertOptions {
  title: string;
  message?: string;
  type?: AlertType;
  onConfirm?: () => void;
  onCancel?: () => void;
  confirmText?: string;
  cancelText?: string;
  autoClose?: boolean; // For toast-like behavior
  duration?: number;
}

interface AlertContextType {
  showAlert: (options: AlertOptions) => void;
  hideAlert: () => void;
  alertState: AlertState | null;
}

interface AlertState extends AlertOptions {
  visible: boolean;
}

const AlertContext = createContext<AlertContextType | undefined>(undefined);

export const AlertProvider = ({ children }: { children: ReactNode }) => {
  const [alertState, setAlertState] = useState<AlertState | null>(null);

  const hideAlert = useCallback(() => {
    setAlertState((prev) => prev ? { ...prev, visible: false } : null);
    // Allow animation to finish before nulling out (handled in component)
    setTimeout(() => setAlertState(null), 350); 
  }, []);

  const showAlert = useCallback((options: AlertOptions) => {
    setAlertState({ 
        ...options, 
        visible: true, 
        type: options.type || 'info' 
    });

    if (options.autoClose) {
        setTimeout(() => {
            hideAlert();
        }, options.duration || 3000);
    }
  }, [hideAlert]);

  return (
    <AlertContext.Provider value={{ showAlert, hideAlert, alertState }}>
      {children}
    </AlertContext.Provider>
  );
};

export const useAlert = () => {
  const context = useContext(AlertContext);
  if (!context) {
    throw new Error('useAlert must be used within an AlertProvider');
  }
  return context;
};
