// path: app/api/office/finance/liquidity/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { Role } from '@/lib/auth/roles';
import {
  PlatformLiquidityBufferRepository,
  evaluateLiquidityHealthStatus,
  absorbDelayedSettlement,
  replenishLiquidityBuffer,
  evaluateLiquidityHealthAndAlert,
  DEFAULT_PLATFORM_COMPANY_ID,
} from '@/lib/finance/liquidity';

export const dynamic = 'force-dynamic';

const liquidityRepo = new PlatformLiquidityBufferRepository();

/**
 * Step 080.3: GET /api/office/finance/liquidity
 * Retrieves real-time platform liquidity buffer balance, floor threshold, and health ratio.
 */
export async function GET(req: NextRequest | Request) {
  const roleHeader =
    req.headers.get('x-user-role') ||
    req.headers.get('x-staff-role') ||
    '';

  const actorRole = roleHeader as Role;
  const authorizedRoles: Role[] = [Role.FINANCE_OPS, Role.SUPER_ADMIN, Role.CEO];

  if (!authorizedRoles.includes(actorRole)) {
    return NextResponse.json(
      {
        type: 'https://kdsolution.it/errors/forbidden',
        title: 'Access Denied',
        status: 403,
        detail: 'Only Finance Ops, Super Admin, and CEO can view platform liquidity buffers.',
      },
      { status: 403 }
    );
  }

  const companyId = req.headers.get('x-company-id') || DEFAULT_PLATFORM_COMPANY_ID;
  const buffer = await liquidityRepo.getOrCreatePlatformBuffer(companyId);

  const evaluation = evaluateLiquidityHealthStatus(buffer.buffer_balance, buffer.minimum_threshold);

  return NextResponse.json({
    success: true,
    liquidity: {
      id: buffer.id,
      companyId: buffer.company_id,
      bufferBalanceUsd: buffer.buffer_balance,
      minimumThresholdUsd: buffer.minimum_threshold,
      peakChargeback30dUsd: buffer.peak_chargeback_30d,
      delayedSettlementsPendingUsd: buffer.delayed_settlements_pending,
      reserveAllocations: buffer.reserve_allocations,
      status: evaluation.status,
      ratio: evaluation.ratio,
      healthPercentage: evaluation.healthPercentage,
      surplusDeficitUsd: evaluation.surplusDeficitUsd,
      lastEvaluatedAt: buffer.last_evaluated_at,
      lastAlertSentAt: buffer.last_alert_sent_at,
    },
  });
}

/**
 * Step 080.3 & Step 080.4: POST /api/office/finance/liquidity
 * Handles buffer capitalization (replenish), settlement absorption (drawdown), or health alert evaluation.
 */
export async function POST(req: NextRequest | Request) {
  const roleHeader =
    req.headers.get('x-user-role') ||
    req.headers.get('x-staff-role') ||
    '';

  const actorRole = roleHeader as Role;
  const actorId = req.headers.get('x-user-id') || '00000000-0000-0000-0000-000000000000';
  const authorizedRoles: Role[] = [Role.FINANCE_OPS, Role.SUPER_ADMIN, Role.CEO];

  if (!authorizedRoles.includes(actorRole)) {
    return NextResponse.json(
      {
        type: 'https://kdsolution.it/errors/forbidden',
        title: 'Access Denied',
        status: 403,
        detail: 'Unauthorized to mutate platform liquidity buffers.',
      },
      { status: 403 }
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      {
        type: 'https://kdsolution.it/errors/bad-request',
        title: 'Invalid Request Body',
        status: 400,
        detail: 'JSON body required.',
      },
      { status: 400 }
    );
  }

  const { action } = body;
  const companyId = body.companyId || DEFAULT_PLATFORM_COMPANY_ID;

  if (action === 'replenish') {
    const { amountUsd, source, recoveredDelayedSettlementUsd } = body;
    if (!amountUsd || isNaN(Number(amountUsd)) || Number(amountUsd) <= 0) {
      return NextResponse.json(
        {
          type: 'https://kdsolution.it/errors/bad-request',
          title: 'Invalid Amount',
          status: 400,
          detail: 'Valid positive amountUsd is required.',
        },
        { status: 400 }
      );
    }

    const result = await replenishLiquidityBuffer({
      companyId,
      amountUsd,
      source: source || 'Company Operating Treasury Deposit',
      recoveredDelayedSettlementUsd,
      actorId,
    });

    return NextResponse.json({
      success: true,
      message: 'Liquidity buffer successfully capitalized.',
      buffer: result.buffer,
      newBufferBalanceUsd: result.newBufferBalanceUsd,
      status: result.status,
    });
  }

  if (action === 'drawdown' || action === 'absorb_delay') {
    const { settlementAmountUsd, merchantId, batchId, notes } = body;
    if (!settlementAmountUsd || isNaN(Number(settlementAmountUsd)) || Number(settlementAmountUsd) <= 0) {
      return NextResponse.json(
        {
          type: 'https://kdsolution.it/errors/bad-request',
          title: 'Invalid Settlement Amount',
          status: 400,
          detail: 'Valid positive settlementAmountUsd is required.',
        },
        { status: 400 }
      );
    }

    try {
      const result = await absorbDelayedSettlement({
        companyId,
        settlementAmountUsd,
        merchantId: merchantId || 'merch_batch_simulation',
        batchId: batchId || 'BATCH_SETTLEMENT_DELAY_01',
        actorId,
        notes,
      });

      return NextResponse.json({
        success: true,
        message: 'Settlement delay absorbed by company emergency liquidity buffer.',
        remainingBufferUsd: result.remainingBufferUsd,
        drawdownAmountUsd: result.drawdownAmountUsd,
        status: result.status,
        alertGenerated: result.alert !== null,
      });
    } catch (err: any) {
      return NextResponse.json(
        {
          type: 'https://kdsolution.it/errors/insufficient-buffer',
          title: 'Drawdown Failed',
          status: 422,
          detail: err.message,
        },
        { status: 422 }
      );
    }
  }

  if (action === 'evaluate') {
    const buffer = await liquidityRepo.getOrCreatePlatformBuffer(companyId);
    const alert = await evaluateLiquidityHealthAndAlert(buffer);

    return NextResponse.json({
      success: true,
      alertDispatched: alert !== null,
      alert,
    });
  }

  return NextResponse.json(
    {
      type: 'https://kdsolution.it/errors/bad-request',
      title: 'Unknown Action',
      status: 400,
      detail: 'Action must be one of: "replenish", "drawdown", "evaluate".',
    },
    { status: 400 }
  );
}
