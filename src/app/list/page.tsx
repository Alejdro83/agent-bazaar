'use client';

import { useState } from 'react';
import { useTelegram } from '@/hooks/useTelegram';
import { MiniAppShell } from '@/components/miniapp/MiniAppShell';

const CATEGORIES = [
  { id: 'yield', label: 'Yield', icon: '🌾', description: 'Harvest, restake, optimize APY' },
  { id: 'trading', label: 'Trading', icon: '📈', description: 'Grid trading, DCA, arbitrage' },
  { id: 'defi', label: 'DeFi', icon: '🏦', description: 'Lending, borrowing, liquidation protection' },
  { id: 'monitoring', label: 'Monitoring', icon: '👁️', description: 'Alerts, tracking, notifications' },
  { id: 'analytics', label: 'Analytics', icon: '📊', description: 'Data analysis, reporting' },
  { id: 'other', label: 'Other', icon: '🤖', description: 'Custom agents' },
];

const PRICING_TYPES = [
  { id: 'free', label: 'Free', description: 'No charge, build reputation' },
  { id: 'fixed', label: 'Fixed Price', description: 'Monthly subscription' },
  { id: 'percentage', label: '% of Yield', description: 'Earn based on performance' },
];

export default function ListAgentPage() {
  const { haptic, user } = useTelegram();
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    category: '',
    pricing_type: 'free',
    pricing_value: 0,
    wallet_address: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const updateForm = (field: string, value: string | number) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const nextStep = () => {
    haptic?.impactOccurred('light');
    setStep(prev => Math.min(prev + 1, 3));
  };

  const prevStep = () => {
    haptic?.impactOccurred('light');
    setStep(prev => Math.max(prev - 1, 1));
  };

  const handleSubmit = async () => {
    haptic?.impactOccurred('heavy');
    setIsSubmitting(true);
    
    // TODO: Submit to Supabase
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    haptic?.notificationOccurred('success');
    setIsSubmitting(false);
    
    // Send data back to bot
    if (window.Telegram?.WebApp) {
      window.Telegram.WebApp.sendData(JSON.stringify({
        action: 'agent_listed',
        agent_name: formData.name,
      }));
    }
  };

  const canProceed = () => {
    switch (step) {
      case 1: return formData.name && formData.description && formData.category;
      case 2: return formData.pricing_type && (formData.pricing_type === 'free' || formData.pricing_value > 0);
      case 3: return formData.wallet_address;
      default: return false;
    }
  };

  return (
    <MiniAppShell>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white mb-1">List Your Agent</h1>
        <p className="text-gray-400">Share your AI agent with the BNB Chain community</p>
      </div>

      {/* Progress Steps */}
      <div className="flex items-center justify-between mb-8">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex items-center">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
              s <= step 
                ? 'bg-amber-500 text-white' 
                : 'bg-gray-800 text-gray-500'
            }`}>
              {s}
            </div>
            {s < 3 && (
              <div className={`w-16 h-0.5 mx-2 ${
                s < step ? 'bg-amber-500' : 'bg-gray-800'
              }`} />
            )}
          </div>
        ))}
      </div>

      {/* Step 1: Basic Info */}
      {step === 1 && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Agent Name
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => updateForm('name', e.target.value)}
              placeholder="e.g., YieldHarvester Pro"
              className="w-full rounded-xl border border-gray-800 bg-gray-900/50 px-4 py-3 text-white placeholder-gray-500 focus:border-amber-500/50 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => updateForm('description', e.target.value)}
              placeholder="What does your agent do? What problems does it solve?"
              rows={4}
              className="w-full rounded-xl border border-gray-800 bg-gray-900/50 px-4 py-3 text-white placeholder-gray-500 focus:border-amber-500/50 focus:outline-none resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Category
            </label>
            <div className="grid grid-cols-2 gap-2">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => {
                    updateForm('category', cat.id);
                    haptic?.selectionChanged();
                  }}
                  className={`p-3 rounded-xl border text-left transition-colors ${
                    formData.category === cat.id
                      ? 'border-amber-500/50 bg-amber-500/10'
                      : 'border-gray-800 bg-gray-900/50 hover:border-gray-700'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span>{cat.icon}</span>
                    <span className="font-medium text-white text-sm">{cat.label}</span>
                  </div>
                  <p className="text-xs text-gray-500">{cat.description}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Step 2: Pricing */}
      {step === 2 && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Pricing Model
            </label>
            <div className="space-y-2">
              {PRICING_TYPES.map((type) => (
                <button
                  key={type.id}
                  onClick={() => {
                    updateForm('pricing_type', type.id);
                    haptic?.selectionChanged();
                  }}
                  className={`w-full p-4 rounded-xl border text-left transition-colors ${
                    formData.pricing_type === type.id
                      ? 'border-amber-500/50 bg-amber-500/10'
                      : 'border-gray-800 bg-gray-900/50 hover:border-gray-700'
                  }`}
                >
                  <div className="font-medium text-white">{type.label}</div>
                  <p className="text-sm text-gray-500">{type.description}</p>
                </button>
              ))}
            </div>
          </div>

          {formData.pricing_type === 'fixed' && (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Monthly Price (USD)
              </label>
              <input
                type="number"
                value={formData.pricing_value || ''}
                onChange={(e) => updateForm('pricing_value', parseFloat(e.target.value) || 0)}
                placeholder="25"
                className="w-full rounded-xl border border-gray-800 bg-gray-900/50 px-4 py-3 text-white placeholder-gray-500 focus:border-amber-500/50 focus:outline-none"
              />
            </div>
          )}

          {formData.pricing_type === 'percentage' && (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Percentage of Yield (%)
              </label>
              <input
                type="number"
                value={formData.pricing_value || ''}
                onChange={(e) => updateForm('pricing_value', parseFloat(e.target.value) || 0)}
                placeholder="0.5"
                step="0.1"
                min="0"
                max="100"
                className="w-full rounded-xl border border-gray-800 bg-gray-900/50 px-4 py-3 text-white placeholder-gray-500 focus:border-amber-500/50 focus:outline-none"
              />
            </div>
          )}
        </div>
      )}

      {/* Step 3: Wallet */}
      {step === 3 && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Agent Wallet Address (BSC)
            </label>
            <input
              type="text"
              value={formData.wallet_address}
              onChange={(e) => updateForm('wallet_address', e.target.value)}
              placeholder="0x..."
              className="w-full rounded-xl border border-gray-800 bg-gray-900/50 px-4 py-3 text-white placeholder-gray-500 focus:border-amber-500/50 focus:outline-none"
            />
            <p className="text-xs text-gray-500 mt-2">
              This is the wallet that will receive payments. Use TWAK or Altana for agent wallets.
            </p>
          </div>

          <div className="p-4 rounded-xl border border-amber-800/30 bg-amber-900/10">
            <h4 className="font-medium text-amber-400 mb-2">📋 Review Your Listing</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Name:</span>
                <span className="text-white">{formData.name || '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Category:</span>
                <span className="text-white">{formData.category || '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Pricing:</span>
                <span className="text-white">
                  {formData.pricing_type === 'free' 
                    ? 'Free' 
                    : formData.pricing_type === 'fixed' 
                      ? `$${formData.pricing_value}/mo` 
                      : `${formData.pricing_value}% yield`}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Navigation Buttons */}
      <div className="flex gap-3 mt-8 mb-20">
        {step > 1 && (
          <button
            onClick={prevStep}
            className="flex-1 py-3 px-6 rounded-xl border border-gray-800 text-gray-300 font-medium hover:bg-gray-900/50 transition-colors"
          >
            Back
          </button>
        )}
        
        {step < 3 ? (
          <button
            onClick={nextStep}
            disabled={!canProceed()}
            className="flex-1 py-3 px-6 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-semibold hover:from-amber-600 hover:to-orange-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={!canProceed() || isSubmitting}
            className="flex-1 py-3 px-6 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-semibold hover:from-amber-600 hover:to-orange-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <span className="flex items-center justify-center gap-2">
                <span className="animate-spin">⏳</span>
                Listing...
              </span>
            ) : (
              '🚀 List Agent'
            )}
          </button>
        )}
      </div>
    </MiniAppShell>
  );
}