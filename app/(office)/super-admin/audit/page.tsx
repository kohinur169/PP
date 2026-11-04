// path: app/(office)/super-admin/audit/page.tsx

import { redirect } from 'next/navigation';

export default function AuditRootPage() {
  redirect('/super-admin/audit/permissions');
}
