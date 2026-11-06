// path: lib/processors/nmi-types.ts

/**
 * Standard NMI Gateway transaction response codes:
 * 1 = Approved
 * 2 = Declined
 * 3 = Error in transaction data or system error
 */
export type NmiResponseCode = '1' | '2' | '3';

export interface NmiDirectPostResponse {
  /** Numeric response code: 1=Approved, 2=Declined, 3=Error */
  response: NmiResponseCode;
  /** Human-readable text description (e.g. "APPROVED", "DECLINE", "Invalid Card") */
  responsetext: string;
  /** Unique gateway transaction identifier */
  transactionid: string;
  /** Gateway authorization code assigned by the card network */
  authcode?: string | undefined;
  /** 3-digit gateway decline/result code */
  response_code: string;
  /** AVS result code (e.g. "Y", "N", "A") */
  avsresponse?: string | undefined;
  /** CVV result code (e.g. "M", "N", "P") */
  cvvresponse?: string | undefined;
  /** Order identifier passed in request */
  orderid?: string | undefined;
  /** Transaction type executed (e.g. "auth", "sale", "capture", "refund", "void") */
  type?: string | undefined;
}

export interface NmiDirectPostRequest {
  /** Gateway security key / API private key */
  security_key: string;
  /** Transaction type: auth, sale, capture, refund, void */
  type: 'auth' | 'sale' | 'capture' | 'refund' | 'void';
  /** Transaction amount in standard decimal string format (e.g. "100.50") */
  amount: string;
  /** Collect.js generated payment token */
  payment_token?: string | undefined;
  /** Original transaction ID for capture, refund, or void */
  transactionid?: string | undefined;
  /** Merchant order identifier */
  orderid?: string | undefined;
  /** Customer billing information */
  email?: string | undefined;
  first_name?: string | undefined;
  last_name?: string | undefined;
  address1?: string | undefined;
  city?: string | undefined;
  state?: string | undefined;
  zip?: string | undefined;
  country?: string | undefined;
  /** Currency code (strictly USD in this architecture) */
  currency?: 'USD' | undefined;
  /** Custom tracking / idempotency metadata */
  ponumber?: string | undefined;
  orderdescription?: string | undefined;
}

export interface NmiAdapterConfig {
  /** Master or sub-merchant NMI gateway security key */
  securityKey: string;
  /** NMI Direct Post API endpoint URL */
  endpointUrl?: string;
  /** Custom fetch implementation for unit testing and network isolation */
  httpClient?: typeof fetch;
}
