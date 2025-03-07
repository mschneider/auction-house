import { PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { Auction, OpenOrders } from "../../../generated/accounts";
import Modal from "../../components/Modal";
import useLocalStorageState from "../../hooks/useLocalStorageState";
import useWallet from "../../hooks/useWallet";
import * as nacl from "tweetnacl";

import useAuctionStore, {
  fetchAuction,
  fetchAuctions,
  fetchOpenOrders,
} from "../../stores/AuctionStore";
import useTokenStore, {
  fetchMintAndTokenAccount,
} from "../../stores/TokenStore";
import useWalletStore from "../../stores/WalletStore";
import useConnectionStore from "../../stores/ConnectionStore";
import { Side } from "../../../generated/types";
import {
  cancelEncryptedOrder,
  cancelOrder,
  initOpenOrders,
  newEncryptedOrder,
  newOrder,
} from "../../../generated/instructions";
import { toFp32, toFpLimitPrice } from "../../../sdk/utils";
import { BN } from "@project-serum/anchor";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";

const AdminView = () => {
  const router = useRouter();
  const { pk } = router.query;
  const { programId } = useAuctionStore((s) => s.program);
  const selected = useAuctionStore((s) => s.selected);
  const orders = useAuctionStore((s) => s.orders);
  const connection = useConnectionStore((s) => s.connection);
  const { tokenAccounts, mints } = useTokenStore((s) => s);
  const wallet = useWalletStore((s) => s.current);
  const connected = useWalletStore((s) => s.connected);

  const [openAskModal, setOpenAskModal] = useState(false);

  const [localOrderKey] = useLocalStorageState(
    "localOrderKey",
    nacl.box.keyPair()
  );

  // local storage messes up the key encoding
  const secretKey = useMemo(() => {
    const buf = Buffer.alloc(nacl.box.secretKeyLength);
    for (let i = 0; i < nacl.box.secretKeyLength; ++i) {
      buf[i] = localOrderKey.secretKey[i];
    }
    return buf;
  }, [localOrderKey]);

  // derive shared secret
  const decryptionKey = useMemo(() => {
    console.log("memo", "decryptionKey", selected?.auction);
    if (selected?.auction) {
      return nacl.box.before(
        Uint8Array.from(selected.auction.naclPubkey),
        secretKey
      );
    }
  }, [selected, secretKey]);

  // TODO: move to token store
  const baseToken = useMemo(() => {
    if (tokenAccounts && selected?.auction.baseMint)
      return tokenAccounts[selected.auction.baseMint.toBase58()]?.address;
  }, [tokenAccounts, selected]);
  const quoteToken = useMemo(() => {
    if (tokenAccounts && selected?.auction.quoteMint)
      return tokenAccounts[selected.auction.quoteMint.toBase58()]?.address;
  }, [tokenAccounts, selected]);
  const baseDecimals = useMemo(() => {
    if (mints && selected?.auction.baseMint)
      return mints[selected.auction.baseMint.toBase58()]?.decimals;
  }, [mints, selected]);
  const quoteDecimals = useMemo(() => {
    if (mints && selected?.auction.quoteMint)
      return mints[selected.auction.quoteMint.toBase58()]?.decimals;
  }, [mints, selected]);
  const baseAmount = useMemo(() => {
    if (tokenAccounts && selected?.auction.baseMint)
      return tokenAccounts[selected.auction.baseMint.toBase58()]?.amount;
  }, [tokenAccounts, selected]);
  const quoteAmount = useMemo(() => {
    if (tokenAccounts && selected?.auction.quoteMint)
      return tokenAccounts[selected.auction.quoteMint.toBase58()]?.amount;
  }, [tokenAccounts, selected]);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm({
    defaultValues: {
      amount: 0,
      price: 0,
      deposit: 0,
    },
  });

  useEffect(() => {
    (async () => {
      if (pk) fetchAuction(new PublicKey(pk));
    })();
  }, [pk]);

  useEffect(() => {
    if (pk && wallet?.publicKey) {
      fetchOpenOrders(new PublicKey(pk), wallet.publicKey);
      fetchMintAndTokenAccount(selected?.auction.baseMint);
      fetchMintAndTokenAccount(selected?.auction.quoteMint);
    }
  }, [pk, wallet, connected, openAskModal]);

  const createAsk = async (data: any) => {
    (async () => {
      if (
        !wallet ||
        !pk ||
        !selected ||
        !baseToken ||
        !quoteToken ||
        !baseDecimals ||
        !quoteDecimals
      )
        return;

      const auction = selected.auction;
      const { quoteMint, baseMint } = auction;

      // TODO: move to auction store
      let [openOrdersPk] = await PublicKey.findProgramAddress(
        [
          wallet.publicKey!.toBuffer(),
          Buffer.from("open_orders"),
          Buffer.from(auction.auctionId),
          auction.authority.toBuffer(),
        ],
        programId
      );
      let [orderHistoryPk] = await PublicKey.findProgramAddress(
        [
          wallet.publicKey!.toBuffer(),
          Buffer.from("order_history"),
          Buffer.from(auction.auctionId),
          auction.authority.toBuffer(),
        ],
        programId
      );

      const tx = new Transaction();

      const openOrders = await OpenOrders.fetch(connection, openOrdersPk);
      if (!openOrders) {
        tx.add(
          initOpenOrders(
            { side: new Side.Ask(), maxOrders: 2 },
            {
              user: wallet.publicKey!,
              auction: new PublicKey(pk),
              openOrders: openOrdersPk,
              orderHistory: orderHistoryPk,
              quoteMint,
              baseMint,
              userQuote: quoteToken,
              userBase: baseToken,
              systemProgram: SystemProgram.programId,
            }
          )
        );
      }
      console.log("createAsk", watch(), auction);
      if (auction.areAsksEncrypted) {
        // convert into native values
        let price = toFp32(watch("price")).shln(32).div(auction.tickSize);
        let quantity = new BN(watch("amount") * Math.pow(10, baseDecimals));
        let tokenQty = new BN(watch("deposit") * Math.pow(10, quoteDecimals));
        console.log({ price, quantity, tokenQty });

        // encrypt native values
        let plainText = Buffer.concat(
          [price, quantity].map((bn) => {
            return bn.toArrayLike(Buffer, "le", 8);
          })
        );
        const nonce = nacl.randomBytes(nacl.box.nonceLength);

        console.log({
          plainText,
          nonce,
          pk: auction.naclPubkey,
          sk: secretKey,
        });
        let cipherText = nacl.box(
          Uint8Array.from(plainText),
          nonce,
          Uint8Array.from(auction.naclPubkey),
          secretKey
        );

        // local storage messes up my keys
        const naclPubkey = Buffer.alloc(nacl.box.publicKeyLength);
        for (let i = 0; i < nacl.box.publicKeyLength; ++i) {
          naclPubkey[i] = localOrderKey.publicKey[i];
        }

        console.log("createAsk", "encrypted", naclPubkey, cipherText);
        tx.add(
          newEncryptedOrder(
            {
              tokenQty,
              naclPubkey: Array.from(naclPubkey),
              nonce: Array.from(nonce),
              cipherText: Array.from(cipherText),
            },
            {
              ...auction,

              user: wallet.publicKey!,
              auction: new PublicKey(pk),
              openOrders: openOrdersPk,
              userQuote: quoteToken,
              userBase: baseToken,
              tokenProgram: TOKEN_PROGRAM_ID,
            }
          )
        );
      } else {
        tx.add(
          newOrder(
            {
              limitPrice: new BN(watch("price") * 2 ** 32)
                .shln(32)
                .div(auction.tickSize)
                .mul(auction.tickSize)
                .shrn(32),
              maxBaseQty: new BN(watch("amount") * Math.pow(10, baseDecimals)),
            },
            {
              ...auction,
              user: wallet.publicKey!,
              auction: new PublicKey(pk),
              openOrders: openOrdersPk,
              userQuote: quoteToken,
              userBase: baseToken,
              tokenProgram: TOKEN_PROGRAM_ID,
            }
          )
        );
      }

      // send & confirm tx
      const sig = await wallet.sendTransaction(tx, connection);
      console.log("create ask", sig);

      await connection.confirmTransaction(sig);
      console.log("create ask confirmed");

      await fetchOpenOrders(new PublicKey(pk), wallet.publicKey!);
    })();
  };

  return (
    <>
      <div className="grid grid-cols-1 gap-4">
        <div className="border p-4">
          <h1>Actions</h1>
          <div className="border p-1 inline-block">
            <button onClick={() => setOpenAskModal(true)}>Create Ask</button>
          </div>
        </div>
        <div className="border p-4">
          <h1>Auction</h1>
          <p>Pk: {pk}</p>
          <p>
            Tick Size:{" "}
            {selected && selected.auction.tickSize.toNumber() / 2 ** 32}
          </p>
        </div>
        <div className="border p-4">
          <h1>Orderbook</h1>
          <p>Bids: </p>
          {selected?.bids.getL2DepthJS(10, false).map((p) => (
            <p>
              {p.size / 10 ** baseDecimals!} @ {p.price / 2 ** 32}
            </p>
          ))}

          <p>Asks:</p>
          {selected?.asks.getL2DepthJS(10, true).map((p) => (
            <p>
              {p.size / 10 ** baseDecimals!} @ {p.price / 2 ** 32}
            </p>
          ))}
        </div>

        <div className="border p-4">
          <h1>Open Orders</h1>
          {orders?.oo && (
            <div>
              <p>Side: {orders.oo.side.kind}</p>
              <p>NumOrders: {orders.oo.numOrders}</p>
              <p>
                Base [free/locked]: {orders.oo.baseTokenFree.toString()} |{" "}
                {orders.oo.baseTokenLocked.toString()}
              </p>
              <p>
                Quote [free/locked]: {orders.oo.quoteTokenFree.toString()} |{" "}
                {orders.oo.quoteTokenLocked.toString()}
              </p>
              <p>Orders:</p>
              {orders.oo.orders.map((o, i) => {
                const price = o.shrn(64).toNumber() / 2 ** 32;

                return (
                  <div className="text-sm" key={i}>
                    <p>Price: {price}</p>
                  </div>
                );
              })}
              <p>Encrypted Orders:</p>
              {decryptionKey &&
                orders.oo.encryptedOrders.map((o, i) => {
                  try {
                    const plainText = nacl.box.open.after(
                      Uint8Array.from(o.cipherText),
                      Uint8Array.from(o.nonce),
                      decryptionKey
                    )!;
                    // scale encrypted price (fp32) by tick size (fp32) and convert to number
                    const price =
                      new BN(plainText.slice(0, 8), undefined, "le")
                        .mul(selected!.auction.tickSize)
                        .shrn(32)
                        .toNumber() /
                      2 ** 32;
                    // quantity in base
                    const quantity =
                      new BN(
                        plainText.slice(8, 16),
                        undefined,
                        "le"
                      ).toNumber() /
                      10 ** baseDecimals!;
                    const deposit = o.tokenQty.toNumber() / 10 ** baseDecimals!;
                    return (
                      <div className="text-sm" key={i}>
                        <p>Price: {price}</p>
                        <p>Quantity: {quantity}</p>
                        <p>Deposit: {deposit}</p>
                      </div>
                    );
                  } catch (e) {
                    console.error(e);
                    return <></>;
                  }
                })}
            </div>
          )}
        </div>
      </div>

      {openAskModal && (
        <Modal
          onClose={() => {
            setOpenAskModal(false);
          }}
          isOpen={openAskModal}
        >
          <div className="">
            <h1>Create Ask</h1>
            <form onSubmit={handleSubmit(createAsk)}>
              <p>Base Balance: {Number(baseAmount!) / 10 ** baseDecimals!}</p>

              <div>
                <label className="space-x-2">
                  <span>Amount:</span>
                  <input
                    type="number"
                    className="border"
                    {...register("amount", { valueAsNumber: true })}
                  />
                </label>
              </div>

              <div>
                <label className="space-x-2">
                  <span>Price:</span>
                  <input
                    type="number"
                    className="border"
                    step="any"
                    {...register("price", { valueAsNumber: true })}
                  />
                </label>
              </div>

              {selected?.auction.areAsksEncrypted && (
                <div>
                  <label className="space-x-2">
                    <span>Deposit:</span>
                    <input
                      type="number"
                      className="border"
                      {...(register("deposit"), { valueAsNumber: true })}
                    />
                  </label>
                </div>
              )}
              <input className="border p-1" type="submit" />
            </form>
          </div>
        </Modal>
      )}
    </>
  );
};

export default AdminView;
