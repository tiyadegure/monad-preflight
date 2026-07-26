/**
 * Monad PreFlight — engine SDK entrypoint.
 *
 * Everything exported here is UI-free, deterministic (the AI layer is a
 * separate, optional module the SDK deliberately does NOT export), and
 * runs in browsers, Node, and edge workers alike. The web app and the
 * reference Risk API worker are both thin callers of this surface.
 *
 * The one-call path most integrators want:
 *
 *   import { NETWORKS, makeNetworkRpc, rpcFactReader,
 *            assessTransaction } from '.../sdk';
 *
 *   const net = NETWORKS.testnet;
 *   const rpc = makeNetworkRpc(net);
 *   const a = await assessTransaction(tx, { rpc, reader: rpcFactReader(rpc) });
 *   // a.sim, a.risks, a.readiness, a.explanation — same as the app shows.
 *
 * Honesty contract (the part that matters): facts that cannot be read
 * become "unknown", unknown is never presented as safe, degraded
 * simulation caps the readiness score, and post-flight lines are
 * three-valued — matched / mismatched / unverified. If you build on this
 * engine, please keep those semantics visible to your users.
 */

export const ENGINE_VERSION = '0.2.0';

/* ---- shared types ---- */
export type {
  Address,
  Hex,
  TokenInfo,
  IntentAction,
  ParsedAmount,
  ParsedIntent,
  ParseSuccess,
  ParseFailure,
  ParseResult,
  PreparedTx,
  PreparedTxKind,
  CallFrameSummary,
  DecodedEvent,
  AssetChange,
  ApprovalChange,
  SimulationResult,
  RiskSeverity,
  RiskFinding,
  RiskContext,
  Explanation,
  PostFlightLine,
  PostFlightLineStatus,
  PostFlightCheck,
} from './types';
export { NATIVE_MON } from './types';

/* ---- networks and transport ---- */
export type { NetworkKey, NetworkConfig } from './networks';
export {
  DEFAULT_NETWORK,
  NETWORKS,
  isNetworkKey,
  makeNetworkRpc,
  txUrl,
  addressUrl,
} from './networks';
export type { RpcCallFn } from './simulate';
export { makeHttpRpc } from './simulate';

/* ---- the assessment pipeline (the front door) ---- */
export type { AssessOptions, AssessTimings, FactReader, FlightAssessment } from './pipeline';
export { assessTransaction, rpcFactReader, viemFactReader } from './pipeline';

/* ---- spoofing / address-poisoning defenses ---- */
export type { SpoofingInput } from './spoofing';
export { assessSpoofing, looksAlike } from './spoofing';

/* ---- the individual stages, for callers that compose their own ---- */
export { parseIntent } from './intent';
export { BuildError, buildTx } from './txbuilder';
export { simulateTx } from './simulate';
export { assessRisks } from './risk';
export type { Readiness, ReadinessBand } from './score';
export { scorePlan } from './score';
export { composeExplanation, describeForReceipt } from './explain';
export { comparePostFlight } from './postflight';
export { compareSimulations } from './drift';
export type { DriftReport } from './drift';

/* ---- signature-request triage (EIP-712 / EIP-7702 / EIP-5792) ---- */
export type { InspectOptions, InspectResult, SignatureKind, SignatureReading } from './inspect';
export { inspectSignaturePayload } from './inspect';
export { explainTypedData, looksLikeTypedData } from './typeddata';
export type { TypedDataExplanation } from './typeddata';
export {
  DELEGATION_PREFIX,
  assessDelegationRisks,
  detectDelegation,
  explainAuthorization,
  looksLikeAuthorization,
} from './delegation';
export type { Delegation, AuthorizationExplanation } from './delegation';
export { MAX_BATCH_CALLS, batchRisks, describeBatch, looksLikeBatch, parseBatch } from './batch';
export type { BatchCall, ParsedBatch } from './batch';

/* ---- wallet-state analysis ---- */
export { assessWalletHealth } from './wallethealth';
export type { HealthCheck, HealthInput, HealthReport } from './wallethealth';
export { scanApprovals } from './approvals';
export type { ApprovalRecord, ApprovalScan } from './approvals';
export { computeExposure } from './portfolio';
export { assessCounterparty } from './reputation';
export type { CounterpartyFacts, Reputation } from './reputation';
export { fingerprintAddress } from './fingerprint';
export type { Fingerprint, FingerprintReader } from './fingerprint';
export { readFees } from './gasoracle';
export type { FeeReading } from './gasoracle';

/* ---- multi-leg journeys ---- */
export type { FlightQueue, LegStatus, QueueLeg } from './queue';
export {
  MAX_LEGS,
  activeLeg,
  advance,
  createQueue,
  isComplete,
  markLeg,
  parseLegs,
  queueSummary,
  splitLegs,
} from './queue';

/* ---- serialization for stateless services ---- */
export { decodeBig, encodeBig } from './jsoncodec';

/* ---- formatting helpers the UI strings are built from ---- */
export { formatTokenAmount, isAddressFormat, shortAddress } from './format';
