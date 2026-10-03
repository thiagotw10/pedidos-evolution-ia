import React from 'react';
import { Establishment } from '../types';

interface SubscriptionGateProps {
  establishment: Establishment | null;
  userEmail?: string | null;
  onSignOut?: () => void;
  children: React.ReactNode;
}

/** Access is controlled by prepaid AI credits at request time. */
export const SubscriptionGate: React.FC<SubscriptionGateProps> = ({ children }) => <>{children}</>;
