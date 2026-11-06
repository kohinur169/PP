// path: lib/auth/supabase.ts
import { getSupabaseClient } from '@/lib/database';
import { logger } from '@/lib/logger';
import {
  SignUpInputSchema,
  SignInInputSchema,
  PasswordResetRequestSchema,
  PasswordUpdateSchema,
} from './types';
import type {
  SignUpInput,
  SignInInput,
  PasswordResetRequest,
  PasswordUpdate,
  AuthResponse,
  AuthUser,
  AuthSession,
} from './types';

/**
 * Registers a new tenant user with Supabase Auth.
 * Passes tenantId, fullName, and role in user metadata so PostgreSQL triggers
 * automatically provision public.users and public.tenant_memberships.
 */
export async function signUpTenantUser(input: SignUpInput): Promise<AuthResponse> {
  const parseResult = SignUpInputSchema.safeParse(input);
  if (!parseResult.success) {
    const errorMsg = parseResult.error.issues[0]?.message ?? 'Invalid registration input';
    logger.warn('User sign-up validation failed', { error: errorMsg });
    return { success: false, error: errorMsg };
  }

  const validated = parseResult.data;

  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.auth.signUp({
      email: validated.email,
      password: validated.password,
      options: {
        data: {
          full_name: validated.fullName,
          tenant_id: validated.tenantId,
          role: validated.role,
        },
      },
    });

    if (error) {
      logger.error('Supabase Auth sign-up error', error, { email: validated.email });
      return { success: false, error: error.message };
    }

    if (!data.user) {
      return { success: false, error: 'User registration failed without user record' };
    }

    const authUser: AuthUser = {
      id: data.user.id,
      email: data.user.email ?? validated.email,
      fullName: validated.fullName,
      isSuperadmin: false,
      status: 'active',
      createdAt: data.user.created_at,
      tenantId: validated.tenantId,
      role: validated.role,
    };

    let authSession: AuthSession | undefined = undefined;
    if (data.session) {
      authSession = {
        user: authUser,
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
        expiresAt: data.session.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
      };
    }

    logger.info('Tenant user registered successfully', {
      userId: authUser.id,
      tenantId: authUser.tenantId,
      role: authUser.role,
    });

    return {
      success: true,
      user: authUser,
      session: authSession,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('Unexpected error during user sign-up', err);
    return { success: false, error: msg };
  }
}

/**
 * Authenticates user credentials via Supabase Auth and returns an active session.
 */
export async function signInUser(input: SignInInput): Promise<AuthResponse> {
  const parseResult = SignInInputSchema.safeParse(input);
  if (!parseResult.success) {
    const errorMsg = parseResult.error.issues[0]?.message ?? 'Invalid sign-in credentials format';
    return { success: false, error: errorMsg };
  }

  const validated = parseResult.data;

  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: validated.email,
      password: validated.password,
    });

    if (error) {
      logger.warn('Failed sign-in attempt', { email: validated.email, error: error.message });
      return { success: false, error: error.message };
    }

    if (!data.user || !data.session) {
      return { success: false, error: 'Authentication succeeded but session was not returned' };
    }

    const metadata = data.user.user_metadata ?? {};

    const authUser: AuthUser = {
      id: data.user.id,
      email: data.user.email ?? validated.email,
      fullName: (metadata.full_name as string) ?? splitEmailName(data.user.email ?? ''),
      isSuperadmin: Boolean(metadata.is_superadmin),
      status: 'active',
      createdAt: data.user.created_at,
      tenantId: (metadata.tenant_id as string) ?? undefined,
      role: (metadata.role as any) ?? 'owner',
    };

    const authSession: AuthSession = {
      user: authUser,
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      expiresAt: data.session.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
    };

    logger.info('User authenticated successfully', {
      userId: authUser.id,
      tenantId: authUser.tenantId,
    });

    return {
      success: true,
      user: authUser,
      session: authSession,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('Unexpected error during user sign-in', err);
    return { success: false, error: msg };
  }
}

/**
 * Terminates the active Supabase Auth user session.
 */
export async function signOutUser(): Promise<{ success: boolean; error?: string | undefined }> {
  try {
    const supabase = getSupabaseClient();
    const { error } = await supabase.auth.signOut();
    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Initiates an email password reset workflow.
 */
export async function requestPasswordReset(
  input: PasswordResetRequest,
  redirectTo?: string
): Promise<{ success: boolean; error?: string | undefined }> {
  const parseResult = PasswordResetRequestSchema.safeParse(input);
  if (!parseResult.success) {
    return { success: false, error: parseResult.error.issues[0]?.message };
  }

  try {
    const supabase = getSupabaseClient();
    const { error } = await supabase.auth.resetPasswordForEmail(parseResult.data.email, {
      redirectTo: redirectTo ?? `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/auth/reset-password`,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Updates an authenticated user's password.
 */
export async function updateUserPassword(input: PasswordUpdate): Promise<AuthResponse> {
  const parseResult = PasswordUpdateSchema.safeParse(input);
  if (!parseResult.success) {
    return { success: false, error: parseResult.error.issues[0]?.message };
  }

  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.auth.updateUser({
      password: parseResult.data.password,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    if (!data.user) {
      return { success: false, error: 'Failed to update user password' };
    }

    return {
      success: true,
      user: {
        id: data.user.id,
        email: data.user.email ?? '',
        fullName: (data.user.user_metadata?.full_name as string) ?? '',
        isSuperadmin: false,
        status: 'active',
        createdAt: data.user.created_at,
      },
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function splitEmailName(email: string): string {
  const namePart = email.split('@')[0] ?? 'User';
  return namePart.charAt(0).toUpperCase() + namePart.slice(1);
}
