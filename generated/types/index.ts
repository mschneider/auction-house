import * as Side from "./Side"

export { AobBumps } from "./AobBumps"
export type { AobBumpsFields, AobBumpsJSON } from "./AobBumps"
export { EncryptedOrder } from "./EncryptedOrder"
export type { EncryptedOrderFields, EncryptedOrderJSON } from "./EncryptedOrder"
export { InitAuctionArgs } from "./InitAuctionArgs"
export type {
  InitAuctionArgsFields,
  InitAuctionArgsJSON,
} from "./InitAuctionArgs"
export { Side }

export type SideKind = Side.Bid | Side.Ask
export type SideJSON = Side.BidJSON | Side.AskJSON
