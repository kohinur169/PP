// path: app/(public)/legal/[slug]/page.tsx

import React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  PolicyRepository,
  seedPolicyCatalog,
  PolicyEntity,
} from '@/lib/cms/policies';

export const dynamic = 'force-dynamic';

const policyRepo = new PolicyRepository();

interface LegalPolicyPageProps {
  params: Promise<{ slug: string }> | { slug: string };
}

export default async function PublicLegalPolicyPage(props: LegalPolicyPageProps) {
  const resolvedParams = await Promise.resolve(props.params);
  const slug = resolvedParams.slug.toLowerCase().trim();

  await seedPolicyCatalog(policyRepo);
  const policy: PolicyEntity | null = await policyRepo.getActivePolicyBySlug(slug);

  if (!policy) {
    notFound();
  }

  const effectiveDateFormatted = new Date(policy.effective_date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Navigation Breadcrumb */}
        <div className="flex items-center space-x-2 text-xs text-slate-400">
          <Link href="/" className="hover:text-white transition-colors">
            Home
          </Link>
          <span>/</span>
          <span className="text-slate-300">Legal & Compliance</span>
          <span>/</span>
          <span className="text-emerald-400 font-medium">{policy.title}</span>
        </div>

        {/* Policy Header Card */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-6">
            <div>
              <div className="flex items-center space-x-3">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">
                  Version {policy.policy_version}.0 (Active)
                </span>
                <span className="text-xs uppercase tracking-wider text-slate-400 font-semibold">
                  {policy.category} Policy
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white mt-2 tracking-tight">
                {policy.title}
              </h1>
            </div>

            <div className="text-right sm:text-right text-xs text-slate-400">
              <span className="block font-medium text-slate-300">Effective Date</span>
              <span className="font-mono text-emerald-400">{effectiveDateFormatted}</span>
            </div>
          </div>

          {policy.change_summary && (
            <div className="mt-4 p-3 rounded-lg bg-slate-950/60 border border-slate-800/80 text-xs text-slate-400">
              <span className="font-semibold text-slate-300">Revision Summary:</span>{' '}
              {policy.change_summary}
            </div>
          )}
        </div>

        {/* Policy Document Body */}
        <div className="bg-slate-900/50 border border-slate-800/80 rounded-2xl p-6 sm:p-10 shadow-xl prose prose-invert max-w-none text-slate-300 leading-relaxed text-sm sm:text-base space-y-6">
          {policy.content_md.split('\n\n').map((paragraph, index) => {
            if (paragraph.startsWith('# ')) {
              return (
                <h1 key={index} className="text-2xl font-bold text-white pt-4 pb-2 border-b border-slate-800">
                  {paragraph.replace('# ', '')}
                </h1>
              );
            }
            if (paragraph.startsWith('## ')) {
              return (
                <h2 key={index} className="text-xl font-bold text-slate-100 pt-4 pb-1">
                  {paragraph.replace('## ', '')}
                </h2>
              );
            }
            if (paragraph.startsWith('### ')) {
              return (
                <h3 key={index} className="text-lg font-semibold text-slate-200 pt-2 pb-1">
                  {paragraph.replace('### ', '')}
                </h3>
              );
            }
            return (
              <p key={index} className="text-slate-300">
                {paragraph}
              </p>
            );
          })}
        </div>

        {/* Legal Disclaimer Footer */}
        <div className="border-t border-slate-800/80 pt-6 text-center text-xs text-slate-500 space-y-2">
          <p>
            KD Solution IT Payment Processing Platform &middot; Fully Segregated Fiduciary Custody &middot; PCI-DSS Level 1 SAQ-A Certified
          </p>
          <p>
            For compliance inquiries or legal notices, contact our designated Compliance Officer at{' '}
            <span className="text-slate-400 font-mono">compliance.officer@kdsolution.it</span>.
          </p>
        </div>
      </div>
    </div>
  );
}
