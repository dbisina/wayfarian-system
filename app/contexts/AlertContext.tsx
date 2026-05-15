import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

export type AlertType = 'success' | 'error' | 'warning' | 'info' | 'confirm';

/** Options passed to `showAlert`. All fields except `title` are optional. */
export interface AlertOptions {
  title: string;
  message?: string;
  type?: AlertType;
  onConfirm?: () => void;
  onCancel?: () => void;
  confirmText?: string;
  cancelText?: string;
  /** When true the alert dismisses itself after `duration` ms (toast-like behaviour). */
  autoClose?: boolean;
  duration?: number;
}

/** Shape of the context value exposed to consumers. */
interface AlertContextType {
  showAlert: (options: AlertOptions) => void;
  hideAlert: () => void;
  alertState: AlertState | null;
}

interface AlertState extends AlertOptions {
  visible: boolean;
}

const AlertContext = createContext<AlertContextType | undefined>(undefined);

/** Provides a single app-wide alert/modal layer driven by imperative `showAlert` calls. */
export const AlertProvider = ({ children }: { children: ReactNode }) => {
  const [alertState, setAlertState] = useState<AlertState | null>(null);

  const hideAlert = useCallback(() => {
    // Mark invisible first so exit animations can play, then null after they finish.
    setAlertState((prev) => prev ? { ...prev, visible: false } : null);
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

/**
 * Returns the alert context.
 * Must be called inside an `AlertProvider`.
 */
export const useAlert = () => {
  const context = useContext(AlertContext);
  if (!context) {
    throw new Error('useAlert must be used within an AlertProvider');
  }
  return context;
};
