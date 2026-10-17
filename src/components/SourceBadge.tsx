import React from 'react';
import { LeadSource } from '../types';
import { Globe, PhoneCall, MessageCircle, Store, HelpCircle } from 'lucide-react';

interface SourceBadgeProps {
  source: LeadSource;
  size?: 'sm' | 'md';
}

export const SourceBadge: React.FC<SourceBadgeProps> = ({ source, size = 'md' }) => {
  const getIcon = () => {
    switch (source) {
      case 'Website':
        return <Globe className="w-3 h-3 text-indigo-500" />;
      case 'AI Voice Call':
      case 'Voice Agent':
        return <PhoneCall className="w-3 h-3 text-purple-500" />;
      case 'WhatsApp':
        return <MessageCircle className="w-3 h-3 text-emerald-500" />;
      case 'Dealer Walk-in':
        return <Store className="w-3 h-3 text-amber-500" />;
      default:
        return <HelpCircle className="w-3 h-3 text-slate-500" />;
    }
  };

  const getStyles = () => {
    switch (source) {
      case 'Website':
        return 'bg-indigo-50 text-indigo-700 border-indigo-200';
      case 'AI Voice Call':
      case 'Voice Agent':
        return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'WhatsApp':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'Dealer Walk-in':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      default:
        return 'bg-slate-50 text-slate-700 border-slate-200';
    }
  };

  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs font-medium';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border ${sizeClasses} ${getStyles()}`}
    >
      {getIcon()}
      <span>{source}</span>
    </span>
  );
};
