import { PublicKey, Transaction } from "@solana/web3.js";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import Modal from "../../components/Modal";
import useLocalStorageState, {
  handleParseKeyPairObj,
} from "../../hooks/useLocalStorageState";
import * as nacl from "tweetnacl";
import Slider from "rc-slider";
import "rc-slider/assets/index.css";
import useAuctionStore, {
  fetchAuction,
  fetchOpenOrders,
} from "../../stores/AuctionStore";
import useTokenStore, {
  fetchMintAndTokenAccount,
} from "../../stores/TokenStore";
import useWalletStore from "../../stores/WalletStore";
import useConnectionStore from "../../stores/ConnectionStore";
import { BN } from "@project-serum/anchor";
import Input, { Label } from "../../components/Input";
import Button from "../../components/Button";
import {
  cancelEncryptedOrderInstructions,
  createBidInstructions,
} from "../../../sdkv2/auction";

const AuctionView = () => {
  const router = useRouter();
  const { pk } = router.query;
  const { programId } = useAuctionStore((s) => s.program);
  const selected = useAuctionStore((s) => s.selected);
  const orders = useAuctionStore((s) => s.orders);
  const connection = useConnectionStore((s) => s.connection);
  const { tokenAccounts, mints } = useTokenStore((s) => s);
  const wallet = useWalletStore((s) => s.current);
  const connected = useWalletStore((s) => s.connected);

  const [openBidModal, setOpenBidModal] = useState(false);

  const [localOrderKey] = useLocalStorageState(
    "localOrderKey",
    nacl.box.keyPair(),
    handleParseKeyPairObj
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
    getValues,
    setValue,
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
  }, [pk, wallet, connected, openBidModal]);

  const createBid = async (data: any) => {
    (async () => {
      if (
        !wallet?.publicKey ||
        !pk ||
        !selected ||
        !quoteToken ||
        !baseDecimals ||
        !quoteDecimals
      )
        return;

      const auction = selected.auction;
      const { quoteMint, baseMint } = auction;

      const tx = new Transaction();
      const bidInstructions = await createBidInstructions({
        connection,
        amount: data.amount,
        price: data.price,
        deposit: data.deposit,
        wallet: wallet.publicKey,
        programId,
        auction,
        auctionPk: new PublicKey(pk),
        quoteToken,
        baseToken,
        baseDecimals,
        quoteDecimals,
        localOrderKey,
      });
      tx.add(...bidInstructions);
      // send & confirm tx
      const sig = await wallet.sendTransaction(tx, connection);
      console.log("create bid", sig);

      await connection.confirmTransaction(sig);
      console.log("create bid confirmed");

      await fetchOpenOrders(new PublicKey(pk), wallet.publicKey!);
    })();
  };

  const cancelBid = async (i: number) => {
    if (!wallet?.publicKey || !pk || !selected || !baseToken || !quoteToken)
      return;
    const auction = selected.auction;

    const tx = new Transaction();
    const cancelInstructions = await cancelEncryptedOrderInstructions({
      auction,
      auctionPk: new PublicKey(pk),
      wallet: wallet.publicKey,
      baseToken,
      orderIdx: i,
      quoteToken,
      programId,
    });
    tx.add(...cancelInstructions);

    // send & confirm tx
    const sig = await wallet.sendTransaction(tx, connection);
    console.log("cancel bid", sig);

    await connection.confirmTransaction(sig);
    console.log("cancel bid confirmed");

    await fetchOpenOrders(new PublicKey(pk), wallet.publicKey!);
  };

  return (
    <>
      <div className="grid grid-cols-1 gap-4">
        <div className="border p-4">
          <h1>Actions</h1>
          <div className=" p-1 inline-block">
            <Button onClick={() => setOpenBidModal(true)}>Create Bid</Button>
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
          {selected?.bids.getL2DepthJS(10, false).map((p, idx) => (
            <p key={idx}>
              {p.size / 10 ** baseDecimals!} @ {p.price / 2 ** 32}
            </p>
          ))}

          <p>Asks:</p>
          {selected?.asks.getL2DepthJS(10, true).map((p, idx) => (
            <p key={idx}>
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
                      <div className="text-sm flex flex-row" key={i}>
                        <div>
                          <p>Price: {price}</p>
                          <p>Quantity: {quantity}</p>
                          <p>Deposit: {deposit}</p>
                        </div>

                        <div className="p-4">
                          <div className=" p-1 inline-block">
                            <Button onClick={() => cancelBid(i)}>cancel</Button>{" "}
                          </div>
                        </div>
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

      {openBidModal && (
        <Modal
          onClose={() => {
            setOpenBidModal(false);
          }}
          isOpen={openBidModal}
        >
          <div className="">
            <h2 className="mb-5">Place your bid</h2>
            <form onSubmit={handleSubmit(createBid)} className="space-y-2">
              <p>
                Quote Balance: {Number(quoteAmount!) / 10 ** quoteDecimals!}
              </p>

              <div>
                <Label>Bid Price:</Label>
                <Input
                  type="number"
                  step="any"
                  {...register("price", { valueAsNumber: true })}
                />
              </div>
              <div>
                <Label>Bid Amount:</Label>
                <Input
                  type="number"
                  step="any"
                  {...register("amount", { valueAsNumber: true })}
                />
              </div>
              {selected?.auction.areBidsEncrypted && (
                <div>
                  <label className="space-x-2">
                    <p>
                      Deposit more to hide your actual bid: {watch("deposit")}
                    </p>

                    <Slider
                      min={getValues("amount") * getValues("price")}
                      max={Number(quoteAmount!) / 10 ** quoteDecimals!}
                      defaultValue={getValues("amount") * getValues("price")}
                      onChange={(d) => setValue("deposit", d as number)}
                    />
                  </label>
                </div>
              )}
              <div className="flex pt-2">
                <Button className="ml-auto" type="submit">
                  Place bid
                </Button>
              </div>
            </form>
          </div>
        </Modal>
      )}
    </>
  );
};

export default AuctionView;
