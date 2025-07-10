import { useState, useEffect } from 'react';
import { Buffer } from 'buffer';
import { ethers } from 'ethers';
import axios from 'axios';
import JSZip from 'jszip';

// Components
import Spinner from 'react-bootstrap/Spinner';
import Navigation from './components/Navigation';

// ABIs
import NFT from './abis/NFT.json';

// Config
import config from './config.json';

function App() {
  const [provider, setProvider] = useState(null);
  const [account, setAccount] = useState(null);
  const [nft, setNFT] = useState(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [image, setImage] = useState(null);
  const [url, setURL] = useState(null);

  const [message, setMessage] = useState("");
  const [isWaiting, setIsWaiting] = useState(false);

  const loadBlockchainData = async () => {
    try {
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      setProvider(provider);
      const network = await provider.getNetwork();
      if (config[network.chainId]) {
        const nft = new ethers.Contract(config[network.chainId].nft.address, NFT, provider);
        setNFT(nft);
      } else {
        window.alert('Contract not deployed to the current network. Please switch networks in MetaMask.');
      }
    } catch (error) {
      console.error("Could not load blockchain data:", error);
    }
  };

  const submitHandler = async (e) => {
    e.preventDefault();
    if (name === "" || description === "") {
      window.alert("Please provide a name and description");
      return;
    }
    setIsWaiting(true);
    setMessage("");
    setImage(null);
    setURL(null);
    try {
      const imageData = await createImage();
      const tokenURI = await uploadImage(imageData);
      await mintImage(tokenURI);
      setMessage("NFT Minted Successfully! Your download will start shortly.");
    } catch (error) {
      console.error("The entire process failed:", error);
      window.alert("An error occurred. Please check the console for details.");
      setMessage("Process failed. Please try again.");
    }
    setIsWaiting(false);
  };

  const triggerDownload = async (imageData, metadata) => {
    const zip = new JSZip();

    zip.file("image.jpeg", imageData, { binary: true });
    zip.file("metadata.json", JSON.stringify(metadata, null, 2));

    const zipBlob = await zip.generateAsync({ type: "blob" });

    const link = document.createElement("a");
    link.href = URL.createObjectURL(zipBlob);
    link.download = "nft-package.zip";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const createImage = async () => {
      setMessage("Generating Image...");

      if (!process.env.REACT_APP_HUGGING_FACE_API_KEY) {
        setMessage("Hugging Face API Key is missing. Please check your .env file.");
        throw new Error("Hugging Face API Key not found.");
      }

      // --- STEP 1: REQUEST IMAGE GENERATION ---
      const generationUrl = "https://router.huggingface.co/nebius/v1/images/generations";
      
      const generationResponse = await axios({
          url: generationUrl,
          method: 'POST',
          headers: {
              Authorization: `Bearer ${process.env.REACT_APP_HUGGING_FACE_API_KEY}`,
              'Content-Type': 'application/json',
          },
          data: {
              prompt: description,
              model: "stability-ai/sdxl",
          },
      });

      const imageUrl = generationResponse.data.data[0].url;

      if (!imageUrl) {
          setMessage("Failed to get image URL from API.");
          throw new Error("Missing image URL in API response.");
      }
      
      setMessage("Image Generated. Now Downloading...");

      // --- STEP 2: DOWNLOAD THE GENERATED IMAGE ---
      const imageResponse = await axios({
          url: imageUrl,
          method: 'GET',
          responseType: 'arraybuffer',
      });

      // --- PROCESS AND DISPLAY THE DOWNLOADED IMAGE ---
      const type = imageResponse.headers['content-type'];
      const data = imageResponse.data;

      const base64data = Buffer.from(data).toString('base64');
      const img = `data:${type};base64,` + base64data;
      setImage(img);

      return data;
  };

  const uploadImage = async (imageData) => {
    setMessage("Uploading to IPFS via Tatum...");
    const apiKey = process.env.REACT_APP_TATUM_API_KEY;
    const tatumApiUrl = 'https://api-eu1.tatum.io/v3/ipfs';

    // Step 1: Upload image file
    const imageFormData = new FormData();
    imageFormData.append('file', new Blob([imageData]), 'image.jpeg');
    const imageUploadResponse = await axios({
      method: 'post', url: tatumApiUrl,
      headers: { 'x-api-key': apiKey, 'Content-Type': 'multipart/form-data' },
      data: imageFormData,
    });
    const imageHash = imageUploadResponse.data.ipfsHash;

    // Step 2: Create metadata and upload it
    setMessage("Uploading metadata...");
    const metadata = {
      name: name,
      description: description,
      image: `ipfs://${imageHash}`
    };

    //console.log("NFT Metadata:", JSON.stringify(metadata, null, 2));

    await triggerDownload(imageData, metadata);

    const metadataFormData = new FormData();
    const metadataFile = new Blob([JSON.stringify(metadata)], { type: 'application/json' });
    metadataFormData.append('file', metadataFile, 'metadata.json');
    const metadataUploadResponse = await axios({
      method: 'post', url: tatumApiUrl,
      headers: { 'x-api-key': apiKey, 'Content-Type': 'multipart/form-data' },
      data: metadataFormData,
    });
    const metadataHash = metadataUploadResponse.data.ipfsHash;
    const tokenURI = `ipfs://${metadataHash}`;
    
    setURL(`https://ipfs.io/ipfs/${metadataHash}`);

    return tokenURI;
  };

  const mintImage = async (tokenURI) => {
    setMessage("Waiting for Mint...");
    const signer = await provider.getSigner();
    const transaction = await nft.connect(signer).mint(tokenURI, { value: ethers.utils.parseUnits("1", "ether") });
    await transaction.wait();
  };

  useEffect(() => {
    loadBlockchainData();
  }, []);

  return (
    <div>
      <Navigation account={account} setAccount={setAccount} />
      <div className='form'>
        <form onSubmit={submitHandler}>
          <input type="text" placeholder="Create a name..." onChange={(e) => { setName(e.target.value) }} />
          <input type="text" placeholder="Create a description..." onChange={(e) => setDescription(e.target.value)} />
          <input type="submit" value="Create & Mint" disabled={isWaiting} />
        </form>
        <div className="image">
          {!isWaiting && image ? (
            <img src={image} alt="AI generated art" />
          ) : isWaiting ? (
            <div className="image__placeholder">
              <Spinner animation="border" />
              <p>{message}</p>
            </div>
          ) : (
            <></>
          )}
        </div>
      </div>
      {!isWaiting && url && (
        <p>
          View <a href={url} target="_blank" rel="noreferrer">Metadata</a>
        </p>
      )}
    </div>
  );
}

export default App;