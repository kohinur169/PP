// path: components/legal/TermsAcceptanceModal.tsx
'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  FileText,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  Lock,
  ArrowRight,
  Hash,
  Scale,
} from 'lucide-react';
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalFooter,
} from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import type { PolicyDefinition } from '@/lib/compliance/terms';

export interface TermsAcceptanceModalProps {
  readonly isOpen: boolean;
  readonly policies: readonly PolicyDefinition[];
  readonly onAcceptAll: (acceptedSlugs: string[]) => Promise<void> | void;
  readonly onDismiss?: (() => void) | undefined;
  readonly userEmail?: string | undefined;
}

export function TermsAcceptanceModal({
  isOpen,
  policies,
  onAcceptAll,
  onDismiss,
  userEmail,
}: TermsAcceptanceModalProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);
  const [isChecked, setIsChecked] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [acceptedSlugs, setAcceptedSlugs] = useState<string[]>([]);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const currentPolicy = policies[currentIndex];
  const totalPolicies = policies.length;
  const isLastPolicy = currentIndex === totalPolicies - 1;

  // Reset scroll and checkbox state whenever active policy changes
  useEffect(() => {
    setHasScrolledToBottom(false);
    setIsChecked(false);

    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  }, [currentIndex, currentPolicy?.slug]);

  // Handle scroll-to-bottom detection
  const handleScroll = () => {
    const el = scrollContainerRef.current;
    if (!el) return;

    // Tolerance of 15px for sub-pixel rendering differences
    const isAtBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 15;
    if (isAtBottom && !hasScrolledToBottom) {
      setHasScrolledToBottom(true);
    }
  };

  const handleNextPolicy = async () => {
    if (!currentPolicy || !hasScrolledToBottom || !isChecked) return;

    const newAccepted = [...acceptedSlugs, currentPolicy.slug];
    setAcceptedSlugs(newAccepted);

    if (isLastPolicy) {
      setIsSubmitting(true);
      try {
        await onAcceptAll(newAccepted);
      } finally {
        setIsSubmitting(false);
      }
    } else {
      setCurrentIndex((prev) => prev + 1);
    }
  };

  if (!isOpen || !currentPolicy) {
    return null;
  }

  return (
    <Modal open={isOpen} onOpenChange={() => {}}>
      <ModalContent className="max-w-2xl p-0 overflow-hidden border shadow-2xl">
        {/* Header Bar */}
        <div className="p-6 bg-gradient-to-r from-card to-muted/40 border-b">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center space-x-2">
              <div className="p-2 rounded-lg bg-primary/10 text-primary border border-primary/20">
                <Scale className="w-5 h-5" />
              </div>
              <Badge variant="outline" className="text-xs font-mono">
                Mandatory Legal Notice
              </Badge>
            </div>
            {totalPolicies > 1 && (
              <span className="text-xs font-medium text-muted-foreground">
                Document {currentIndex + 1} of {totalPolicies}
              </span>
            )}
          </div>

          <ModalTitle className="text-xl font-bold tracking-tight text-foreground">
            {currentPolicy.title}
          </ModalTitle>
          <ModalDescription className="text-xs text-muted-foreground mt-1 flex items-center gap-3">
            <span>Version: <strong className="text-foreground">{currentPolicy.version}</strong></span>
            <span>•</span>
            <span>Effective: {new Date(currentPolicy.effectiveDate).toLocaleDateString()}</span>
          </ModalDescription>
        </div>

        {/* Scrollable Policy Text Body */}
        <div className="relative">
          <div
            ref={scrollContainerRef}
            onScroll={handleScroll}
            className="max-h-72 overflow-y-auto p-6 space-y-4 text-xs font-mono leading-relaxed bg-muted/20 border-b text-muted-foreground"
          >
            <div className="whitespace-pre-wrap">{currentPolicy.content}</div>

            {/* Bottom Target Indicator */}
            <div className="pt-6 border-t border-dashed text-center text-muted-foreground font-sans">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-muted text-[11px]">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                End of Document ({currentPolicy.slug} v{currentPolicy.version})
              </div>
            </div>
          </div>

          {/* Scroll Down Reminder Helper */}
          {!hasScrolledToBottom && (
            <div className="absolute bottom-3 right-4 pointer-events-none">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-card/90 text-primary border shadow-sm text-[11px] font-sans font-medium animate-bounce">
                Scroll to bottom to agree
                <ChevronDown className="w-3 h-3" />
              </span>
            </div>
          )}
        </div>

        {/* Cryptographic Audit Metadata & Checkbox */}
        <div className="p-6 space-y-4 bg-card">
          <div className="p-3 rounded-lg bg-muted/40 border space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-muted-foreground font-mono">
                <Hash className="w-3.5 h-3.5 text-primary" />
                <span>SHA-256 Document Digest:</span>
              </div>
              <span className="font-mono text-[11px] text-foreground font-semibold">
                {currentPolicy.hash.slice(0, 16)}...{currentPolicy.hash.slice(-8)}
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Your electronic acceptance will be cryptographically bound to this document version, your client IP address, and acceptance timestamp.
            </p>
          </div>

          {/* Interactive Agreement Checkbox */}
          <label
            className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
              !hasScrolledToBottom
                ? 'opacity-50 cursor-not-allowed bg-muted/20'
                : 'hover:bg-muted/30 bg-card'
            }`}
          >
            <input
              type="checkbox"
              id="terms-checkbox"
              disabled={!hasScrolledToBottom}
              checked={isChecked}
              onChange={(e) => setIsChecked(e.target.checked)}
              className="mt-0.5 rounded border-muted-foreground text-primary focus:ring-primary w-4 h-4 cursor-pointer"
            />
            <div className="text-xs">
              <span className="font-semibold text-foreground">
                I have reviewed and agree to the {currentPolicy.title} (v{currentPolicy.version})
              </span>
              <p className="text-muted-foreground text-[11px] mt-0.5">
                {userEmail ? `Consenting on behalf of account ${userEmail}.` : 'By checking, you acknowledge legal electronic execution.'}
              </p>
            </div>
          </label>
        </div>

        {/* Modal Footer Controls */}
        <ModalFooter className="p-6 bg-muted/20 border-t flex items-center justify-between sm:justify-between">
          <div className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5 text-emerald-600" />
            <span>Fiduciary Payment Facilitator Compliance</span>
          </div>

          <div className="flex items-center space-x-2">
            {onDismiss && (
              <Button variant="ghost" size="sm" onClick={onDismiss} disabled={isSubmitting}>
                Cancel
              </Button>
            )}
            <Button
              variant="default"
              size="sm"
              disabled={!hasScrolledToBottom || !isChecked || isSubmitting}
              onClick={handleNextPolicy}
              className="flex items-center gap-1.5"
            >
              <span>{isLastPolicy ? 'Sign & Accept All' : 'Accept & Continue'}</span>
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
