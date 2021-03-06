const {assert} = require("local-chai");
const {utils, BigNumber} = require("ethers");
const {expectRevert, zeroAddress, increaseTime} = require("local-utils");
const {setupLandSaleWithReferral} = require("./fixtures");
const {calculateLandHash} = require("../../../lib/merkleTreeHelper");
const {createReferral} = require("../../../lib/referralValidator");

function runSandTests() {
  describe("LandSaleWithReferral:SAND", function () {
    let initialSetUp;
    const emptyReferral = "0x";
    const privateKey = "0x96aa38e97d1d0d19e0f1d5215ff9dad66dc5d99225b1657205d124d00d2de177";
    const referralLinkValidity = 60 * 60 * 24 * 30;

    describe("--> Tests with real LANDs", function () {
      beforeEach(async function () {
        initialSetUp = await setupLandSaleWithReferral("lands");
        const {LandSaleAdmin} = initialSetUp;
        await LandSaleAdmin.LandSaleWithReferral.setSANDEnabled(true);
      });

      it("SAND is enabled", async function () {
        const {contracts} = initialSetUp;
        const isSANDEnabled = await contracts.landSaleWithReferral.isSANDEnabled();
        assert.ok(isSANDEnabled, "SAND should be enabled");
      });

      it("SAND can be disabled", async function () {
        const {LandSaleAdmin} = initialSetUp;
        await LandSaleAdmin.LandSaleWithReferral.functions.setSANDEnabled(false);
        const isSANDEnabled = await LandSaleAdmin.LandSaleWithReferral.functions.isSANDEnabled();
        assert.ok(!isSANDEnabled, "SAND should not be enabled");
      });

      it("SAND cannot be enabled if not admin", async function () {
        const {userWithSAND} = initialSetUp;
        await expectRevert(
          userWithSAND.LandSaleWithReferral.functions.setSANDEnabled(true),
          "only admin can enable/disable SAND"
        );
      });

      it("can buy LAND with SAND (empty referral)", async function () {
        const {tree, userWithSAND, lands} = initialSetUp;
        const land = lands[5];
        const proof = tree.getProof(calculateLandHash(land));
        await userWithSAND.LandSaleWithReferral.functions.buyLandWithSand(
          userWithSAND.address,
          userWithSAND.address,
          zeroAddress,
          land.x,
          land.y,
          land.size,
          land.price,
          land.salt,
          proof,
          emptyReferral
        );
      });

      it("can buy LAND with SAND and referral", async function () {
        const {tree, userWithSAND, userWithoutSAND, LandSaleBeneficiary, lands, contracts} = initialSetUp;
        const land = lands[5];
        const proof = tree.getProof(calculateLandHash(land));

        const referral = {
          referrer: userWithoutSAND.address,
          referee: userWithSAND.address,
          expiryTime: Math.floor(Date.now() / 1000) + referralLinkValidity,
          commissionRate: "500",
        };

        const sig = await createReferral(
          privateKey,
          referral.referrer,
          referral.referee,
          referral.expiryTime,
          referral.commissionRate
        );

        const isReferralValid = await contracts.landSaleWithReferral.isReferralValid(
          sig,
          referral.referrer,
          referral.referee,
          referral.expiryTime,
          referral.commissionRate
        );

        assert.equal(isReferralValid, true, "Referral should be valid");

        const encodedReferral = utils.defaultAbiCoder.encode(
          ["bytes", "address", "address", "uint256", "uint256"],
          [sig, referral.referrer, referral.referee, referral.expiryTime, referral.commissionRate]
        );

        const tx = await userWithSAND.LandSaleWithReferral.functions.buyLandWithSand(
          userWithSAND.address,
          userWithSAND.address,
          zeroAddress,
          land.x,
          land.y,
          land.size,
          land.price,
          land.salt,
          proof,
          encodedReferral
        );

        const receipt = await tx.wait();
        const event = receipt.events[0];
        assert.equal(event.event, "ReferralUsed", "Event name is wrong");

        const referrer = event.args[0];
        const referree = event.args[1];
        const token = event.args[2];
        const amount = event.args[3];
        const commission = event.args[4];
        const commissionRate = event.args[5];

        assert.equal(referrer, referral.referrer, "Referrer is wrong");
        assert.equal(referree, referral.referee, "Referee is wrong");
        assert.equal(token, contracts.sand.address, "Token is wrong");
        assert.equal(amount, land.price, "Amount is wrong");
        assert.equal(commissionRate, referral.commissionRate, "Amount is wrong");

        const referrerBalance = await contracts.sand.balanceOf(userWithoutSAND.address);

        const expectedCommission = BigNumber.from(amount)
          .mul(BigNumber.from(commissionRate))
          .div(BigNumber.from("10000"));

        assert.isOk(commission.eq(expectedCommission), "Commission is wrong");
        assert.isOk(commission.eq(referrerBalance), "Referrer balance is wrong");

        const landSaleBeneficiaryBalance = await contracts.sand.balanceOf(LandSaleBeneficiary.address);
        const expectedLandSaleBeneficiaryBalance = BigNumber.from(amount).sub(BigNumber.from(commission));
        assert.isOk(landSaleBeneficiaryBalance.eq(expectedLandSaleBeneficiaryBalance), "Balance is wrong");
      });

      it("CANNOT buy LAND with SAND if not enabled (empty referral)", async function () {
        const {LandSaleAdmin, tree, userWithSAND, lands} = initialSetUp;

        await LandSaleAdmin.LandSaleWithReferral.functions.setSANDEnabled(false);

        const land = lands[5];
        const proof = tree.getProof(calculateLandHash(land));

        await expectRevert(
          userWithSAND.LandSaleWithReferral.functions.buyLandWithSand(
            userWithSAND.address,
            userWithSAND.address,
            zeroAddress,
            land.x,
            land.y,
            land.size,
            land.price,
            land.salt,
            proof,
            emptyReferral
          ),
          "sand payments not enabled"
        );
      });

      it("can buy Land with SAND and an invalid referral", async function () {
        const {tree, userWithSAND, userWithoutSAND, LandSaleBeneficiary, lands, contracts} = initialSetUp;
        const land = lands[5];
        const proof = tree.getProof(calculateLandHash(land));

        const referral = {
          referrer: userWithoutSAND.address,
          referee: userWithSAND.address,
          expiryTime: Math.floor(Date.now() / 1000) + referralLinkValidity,
          commissionRate: "10000",
        };

        const sig = await createReferral(
          privateKey,
          referral.referrer,
          referral.referee,
          referral.expiryTime,
          referral.commissionRate
        );

        const isReferralValid = await contracts.landSaleWithReferral.isReferralValid(
          sig,
          referral.referrer,
          referral.referee,
          referral.expiryTime,
          referral.commissionRate
        );

        assert.equal(isReferralValid, false, "Referral should be invalid");

        const encodedReferral = utils.defaultAbiCoder.encode(
          ["bytes", "address", "address", "uint256", "uint256"],
          [sig, referral.referrer, referral.referee, referral.expiryTime, referral.commissionRate]
        );

        const tx = await userWithSAND.LandSaleWithReferral.functions.buyLandWithSand(
          userWithSAND.address,
          userWithSAND.address,
          zeroAddress,
          land.x,
          land.y,
          land.size,
          land.price,
          land.salt,
          proof,
          encodedReferral
        );

        const receipt = await tx.wait();
        const event = receipt.events[0];
        assert.equal(event.event, undefined, "Event should be undefined");

        const referrerBalance = await contracts.sand.balanceOf(userWithoutSAND.address);

        assert.equal(referrerBalance, 0, "Referrer balance is wrong");

        const landSaleBeneficiaryBalance = await contracts.sand.balanceOf(LandSaleBeneficiary.address);
        assert.equal(landSaleBeneficiaryBalance, land.price, "Balance is wrong");
      });

      it("CANNOT buy Land without SAND", async function () {
        const {tree, userWithoutSAND, lands} = initialSetUp;
        const land = lands[1];
        const proof = tree.getProof(calculateLandHash(land));

        await expectRevert(
          userWithoutSAND.LandSaleWithReferral.functions.buyLandWithSand(
            userWithoutSAND.address,
            userWithoutSAND.address,
            zeroAddress,
            land.x,
            land.y,
            land.size,
            land.price,
            land.salt,
            proof,
            emptyReferral
          ),
          "not enough fund"
        );
      });

      it("CANNOT buy Land without enough tokens", async function () {
        const {userWithoutSAND, tree, lands, SandAdmin} = initialSetUp;
        const land = lands[1];
        const proof = tree.getProof(calculateLandHash(land));

        await SandAdmin.Sand.transfer(userWithoutSAND.address, "4046");

        await expectRevert(
          userWithoutSAND.LandSaleWithReferral.functions.buyLandWithSand(
            userWithoutSAND.address,
            userWithoutSAND.address,
            zeroAddress,
            land.x,
            land.y,
            land.size,
            land.price,
            land.salt,
            proof,
            emptyReferral
          ),
          "not enough fund"
        );
      });

      it("CANNOT buy Land without just enough tokens", async function () {
        const {userWithoutSAND, tree, lands, SandAdmin} = initialSetUp;
        const land = lands[1];
        const proof = tree.getProof(calculateLandHash(land));

        await SandAdmin.Sand.transfer(userWithoutSAND.address, BigNumber.from(lands[5].price).sub(BigNumber.from(1)));

        await expectRevert(
          userWithoutSAND.LandSaleWithReferral.functions.buyLandWithSand(
            userWithoutSAND.address,
            userWithoutSAND.address,
            zeroAddress,
            land.x,
            land.y,
            land.size,
            land.price,
            land.salt,
            proof,
            emptyReferral
          ),
          "not enough fund"
        );
      });

      it("can buy Land with just enough tokens", async function () {
        const {userWithoutSAND, tree, lands, SandAdmin} = initialSetUp;
        const land = lands[1];
        const proof = tree.getProof(calculateLandHash(land));

        await SandAdmin.Sand.transfer(userWithoutSAND.address, BigNumber.from(lands[5].price));

        await userWithoutSAND.LandSaleWithReferral.functions.buyLandWithSand(
          userWithoutSAND.address,
          userWithoutSAND.address,
          zeroAddress,
          land.x,
          land.y,
          land.size,
          land.price,
          land.salt,
          proof,
          emptyReferral
        );
      });

      it("CANNOT buy Land from a non reserved Land with reserved param (empty referral)", async function () {
        const {tree, userWithSAND, lands} = initialSetUp;
        const land = lands[5];
        const proof = tree.getProof(calculateLandHash(land));

        await expectRevert(
          userWithSAND.LandSaleWithReferral.functions.buyLandWithSand(
            userWithSAND.address,
            userWithSAND.address,
            userWithSAND.address,
            land.x,
            land.y,
            land.size,
            land.price,
            land.salt,
            proof,
            emptyReferral
          ),
          "Invalid land provided"
        );
      });

      it("CANNOT buy LAND when minter rights revoked (empty referral)", async function () {
        const {LandAdmin, tree, userWithSAND, lands, contracts} = initialSetUp;

        await LandAdmin.Land.functions.setMinter(contracts.landSaleWithReferral.address, false).then((tx) => tx.wait());

        const land = lands[5];
        const proof = tree.getProof(calculateLandHash(land));

        await expectRevert(
          userWithSAND.LandSaleWithReferral.functions.buyLandWithSand(
            userWithSAND.address,
            userWithSAND.address,
            zeroAddress,
            land.x,
            land.y,
            land.size,
            land.price,
            land.salt,
            proof,
            emptyReferral
          ),
          "Only a minter can mint"
        );
      });

      it("CANNOT buy LAND twice (empty referral)", async function () {
        const {tree, userWithSAND, lands} = initialSetUp;
        const land = lands[5];
        const proof = tree.getProof(calculateLandHash(land));

        await userWithSAND.LandSaleWithReferral.functions.buyLandWithSand(
          userWithSAND.address,
          userWithSAND.address,
          zeroAddress,
          land.x,
          land.y,
          land.size,
          land.price,
          land.salt,
          proof,
          emptyReferral
        );

        await expectRevert(
          userWithSAND.LandSaleWithReferral.functions.buyLandWithSand(
            userWithSAND.address,
            userWithSAND.address,
            zeroAddress,
            land.x,
            land.y,
            land.size,
            land.price,
            land.salt,
            proof,
            emptyReferral
          ),
          "Already minted"
        );
      });

      it("CANNOT buy LAND with invalid proof (empty referral)", async function () {
        const {userWithSAND, lands} = initialSetUp;
        const proof = [
          "0x0000000000000000000000000000000000000000000000000000000000000001",
          "0x0000000000000000000000000000000000000000000000000000000000000002",
          "0x0000000000000000000000000000000000000000000000000000000000000003",
        ];
        const land = lands[5];

        await expectRevert(
          userWithSAND.LandSaleWithReferral.functions.buyLandWithSand(
            userWithSAND.address,
            userWithSAND.address,
            userWithSAND.address,
            land.x,
            land.y,
            land.size,
            land.price,
            land.salt,
            proof,
            emptyReferral
          ),
          "Invalid land provided"
        );
      });

      it("CANNOT buy LAND with wrong proof (empty referral)", async function () {
        const {tree, userWithSAND, lands} = initialSetUp;
        const land = lands[5];
        const proof = tree.getProof(calculateLandHash(lands[2]));

        await expectRevert(
          userWithSAND.LandSaleWithReferral.functions.buyLandWithSand(
            userWithSAND.address,
            userWithSAND.address,
            userWithSAND.address,
            land.x,
            land.y,
            land.size,
            land.price,
            land.salt,
            proof,
            emptyReferral
          ),
          "Invalid land provided"
        );
      });

      it("after buying user owns all LAND bought (empty referral)", async function () {
        const {tree, userWithSAND, lands, contracts} = initialSetUp;
        const land = lands[4];
        const proof = tree.getProof(calculateLandHash(land));
        await userWithSAND.LandSaleWithReferral.functions.buyLandWithSand(
          userWithSAND.address,
          userWithSAND.address,
          zeroAddress,
          land.x,
          land.y,
          land.size,
          land.price,
          land.salt,
          proof,
          emptyReferral
        );
        for (let x = land.x; x < land.x + land.size; x++) {
          for (let y = land.y; y < land.y + lands.size; y++) {
            const owner = await contracts.land.ownerOf(x + y * 408);
            assert.equal(owner, userWithSAND.address);
            const balance = await contracts.land.balanceOf(userWithSAND.address);
            assert.isOk(balance.eq(BigNumber.from(land.size ** 2)));
          }
        }
      });

      // TODO investigate
      it.skip("CANNOT buy a land after the expiry time (empty referral)", async function () {
        const {lands, userWithSAND, tree} = initialSetUp;
        const land = lands[0];
        const proof = tree.getProof(calculateLandHash(land));
        await increaseTime(60 * 60);
        await expectRevert(
          userWithSAND.LandSaleWithReferral.functions.buyLandWithSand(
            userWithSAND.address,
            userWithSAND.address,
            zeroAddress,
            land.x,
            land.y,
            land.size,
            land.price,
            land.salt,
            proof,
            emptyReferral
          ),
          "sale is over"
        );
      });
    });

    describe("--> Tests with test LANDs for reserved addresses", function () {
      beforeEach(async function () {
        initialSetUp = await setupLandSaleWithReferral("testLands");
        const {SandAdmin} = initialSetUp;
        await SandAdmin.LandSaleWithReferral.setSANDEnabled(true);
      });

      it("CANNOT buy Land from a reserved Land of a different address (empty referral)", async function () {
        const {lands, userWithSAND, tree} = initialSetUp;
        const land = lands[0];
        const proof = tree.getProof(calculateLandHash(land));

        await expectRevert(
          userWithSAND.LandSaleWithReferral.functions.buyLandWithSand(
            userWithSAND.address,
            userWithSAND.address,
            userWithSAND.address,
            land.x,
            land.y,
            land.size,
            land.price,
            land.salt,
            proof,
            emptyReferral
          ),
          "Invalid land provided"
        );
      });

      it("can buy LAND from a reserved Land if matching address (empty referral)", async function () {
        const {lands, secondUserWithSAND, tree, contracts} = initialSetUp;
        const land = lands[0];
        const proof = tree.getProof(calculateLandHash(land));
        await secondUserWithSAND.LandSaleWithReferral.functions.buyLandWithSand(
          secondUserWithSAND.address,
          secondUserWithSAND.address,
          secondUserWithSAND.address,
          land.x,
          land.y,
          land.size,
          land.price,
          land.salt,
          proof,
          emptyReferral
        );
        const owner = await contracts.land.ownerOf(400 + 106 * 408);
        assert.equal(owner, secondUserWithSAND.address);
      });

      it("can buy LAND from a reserved Land and send it to another address (empty referral)", async function () {
        const {lands, secondUserWithSAND, userWithoutSAND, tree, contracts} = initialSetUp;
        const land = lands[0];
        const proof = tree.getProof(calculateLandHash(land));
        await secondUserWithSAND.LandSaleWithReferral.functions.buyLandWithSand(
          secondUserWithSAND.address,
          userWithoutSAND.address,
          secondUserWithSAND.address,
          land.x,
          land.y,
          land.size,
          land.price,
          land.salt,
          proof,
          emptyReferral
        );
        const owner = await contracts.land.ownerOf(400 + 106 * 408);
        assert.equal(owner, userWithoutSAND.address);
      });

      it("can buy all LANDs specified in json except reserved lands (empty referral)", async function () {
        const {lands, userWithSAND, tree} = initialSetUp;
        for (const land of lands) {
          const proof = tree.getProof(calculateLandHash(land));
          if (land.reserved) {
            await expectRevert(
              userWithSAND.LandSaleWithReferral.functions.buyLandWithSand(
                userWithSAND.address,
                userWithSAND.address,
                land.reserved,
                land.x,
                land.y,
                land.size,
                land.price,
                land.salt,
                proof,
                emptyReferral
              ),
              "cannot buy reserved Land"
            );
          } else {
            try {
              await userWithSAND.LandSaleWithReferral.functions.buyLandWithSand(
                userWithSAND.address,
                userWithSAND.address,
                zeroAddress,
                land.x,
                land.y,
                land.size,
                land.price,
                land.salt,
                proof,
                emptyReferral
              );
            } catch (e) {
              console.log(JSON.stringify(land));
              console.log(JSON.stringify(proof));
              throw e;
            }
          }
        }
      });
    });
  });
}

module.exports = {
  runSandTests,
};
