const hre = require("hardhat");

// The Organization of Beautiful, Digital Walls
async function main() {
  const NAME = "The Brick of Truth"
  const SYMBOL = "WALL"
  const COST = ethers.utils.parseUnits("1", "ether")

  const NFT = await hre.ethers.getContractFactory("NFT")
  const nft = await NFT.deploy(NAME, SYMBOL, COST)
  await nft.deployed()

  console.log(`Deployed NFT Contract at: ${nft.address}`)
}


main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
