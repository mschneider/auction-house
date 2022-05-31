import { PublicKey } from "@solana/web3.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@project-serum/borsh"

export interface EncryptedOrderFields {
  nonce: Buffer
  cipherText: Buffer
  tokenQty: BN
}

export interface EncryptedOrderJSON {
  nonce: Array<number>
  cipherText: Array<number>
  tokenQty: string
}

export class EncryptedOrder {
  readonly nonce: Buffer
  readonly cipherText: Buffer
  readonly tokenQty: BN

  constructor(fields: EncryptedOrderFields) {
    this.nonce = fields.nonce
    this.cipherText = fields.cipherText
    this.tokenQty = fields.tokenQty
  }

  static layout(property?: string) {
    return borsh.struct(
      [borsh.vecU8("nonce"), borsh.vecU8("cipherText"), borsh.u64("tokenQty")],
      property
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static fromDecoded(obj: any) {
    return new EncryptedOrder({
      nonce: obj.nonce,
      cipherText: obj.cipherText,
      tokenQty: obj.tokenQty,
    })
  }

  static toEncodable(fields: EncryptedOrderFields) {
    return {
      nonce: Buffer.from(
        fields.nonce.buffer,
        fields.nonce.byteOffset,
        fields.nonce.length
      ),
      cipherText: Buffer.from(
        fields.cipherText.buffer,
        fields.cipherText.byteOffset,
        fields.cipherText.length
      ),
      tokenQty: fields.tokenQty,
    }
  }

  toJSON(): EncryptedOrderJSON {
    return {
      nonce: Array.from(this.nonce.values()),
      cipherText: Array.from(this.cipherText.values()),
      tokenQty: this.tokenQty.toString(),
    }
  }

  static fromJSON(obj: EncryptedOrderJSON): EncryptedOrder {
    return new EncryptedOrder({
      nonce: Buffer.from(obj.nonce),
      cipherText: Buffer.from(obj.cipherText),
      tokenQty: new BN(obj.tokenQty),
    })
  }

  toEncodable() {
    return EncryptedOrder.toEncodable(this)
  }
}
