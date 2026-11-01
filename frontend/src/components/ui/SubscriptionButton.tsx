/**
 * SubscriptionButton — Isolated reusable component demonstrating the Subscription Lottie animation.
 *
 * Uses Asset 5: https://lottie.host/344bc68a-287d-43c6-86e8-f3aa8239ddd2/7reGusn18D.lottie
 * Features StateMachine1 toggle between Free / Premium / Monthly / Annual tiers.
 *
 * Note: Per Phase 9 instructions, this is strictly a preview/demonstration component.
 * It does NOT introduce fake purchasing, billing gateways, or subscription charges.
 */
import React from 'react';
import { LottieAnimation } from './LottieAnimation';
import { Sparkles } from 'lucide-react';

export interface SubscriptionButtonProps {
  className?: string;
  isPreview?: boolean;
}

export const SubscriptionButton: React.FC<SubscriptionButtonProps> = ({
  className = '',
  isPreview = true,
}) => {

  return (
    <div
      className={`subscription-animation-demo ${className}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '12px',
        padding: '1.25rem',
        borderRadius: '16px',
        background: 'rgba(255, 255, 255, 0.02)',
        border: '1px solid var(--border-subtle)',
        maxWidth: 380,
        margin: '0 auto',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#a5b4fc', fontSize: '0.8rem', fontWeight: 600 }}>
        <Sparkles size={16} />
        <span>Subscription &amp; Plans Preview</span>
      </div>

      {/* Lottie Animation using Asset 5 */}
      <div style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
        <LottieAnimation
          src="https://lottie.host/344bc68a-287d-43c6-86e8-f3aa8239ddd2/7reGusn18D.lottie"
          width={240}
          height={120}
          loop
          autoplay
          ariaLabel="Subscription and plans animation"
          lazy
          fallback={
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
              Interactive Plan Toggle
            </div>
          }
        />
      </div>

      {isPreview && (
        <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--text-tertiary)', textAlign: 'center', lineHeight: 1.4 }}>
          Preview mode. In a future update, team plans and expanded AI limits will be selectable here.
        </p>
      )}
    </div>
  );
};

export default SubscriptionButton;
