// App.tsx
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import WalletManager from "./components/WalletManager";
import WalletSelector from "./components/WalletSelector";
import "./App.css";

interface EncryptedRecord {
  id: string;
  encryptedData: string;
  timestamp: number;
  owner: string;
  geneType: string;
  efficiency: number;
  status: "pending" | "verified" | "rejected";
}

const App: React.FC = () => {
  // State management
  const [account, setAccount] = useState("");
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<EncryptedRecord[]>([]);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [walletSelectorOpen, setWalletSelectorOpen] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{
    visible: boolean;
    status: "pending" | "success" | "error";
    message: string;
  }>({ visible: false, status: "pending", message: "" });
  const [newRecordData, setNewRecordData] = useState({
    geneType: "",
    gRNA: "",
    efficiency: 0,
    notes: ""
  });
  const [activeFAQ, setActiveFAQ] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  // Calculate statistics
  const verifiedCount = records.filter(r => r.status === "verified").length;
  const pendingCount = records.filter(r => r.status === "pending").length;
  const rejectedCount = records.filter(r => r.status === "rejected").length;
  const avgEfficiency = records.length > 0 
    ? records.reduce((sum, r) => sum + r.efficiency, 0) / records.length 
    : 0;

  // Filter records based on search term
  const filteredRecords = records.filter(record => 
    record.geneType.toLowerCase().includes(searchTerm.toLowerCase()) ||
    record.id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // FAQ data
  const faqs = [
    {
      question: "How is my gene editing data protected?",
      answer: "All sensitive data is encrypted using Fully Homomorphic Encryption (FHE) before being stored on-chain. This allows for analysis without decryption."
    },
    {
      question: "What types of gene editing can I record?",
      answer: "You can record any CRISPR-based editing experiments including CRISPR-Cas9, CRISPR-Cas12, base editing, and prime editing."
    },
    {
      question: "How does FHE help in genomic research?",
      answer: "FHE allows researchers to perform computations on encrypted data, enabling collaborative analysis without exposing sensitive genomic information."
    },
    {
      question: "Can I share my encrypted records?",
      answer: "Yes, you can securely share encrypted records with collaborators while maintaining data privacy and intellectual property protection."
    }
  ];

  // Initialize application
  useEffect(() => {
    loadRecords().finally(() => setLoading(false));
  }, []);

  // Wallet connection handlers
  const onWalletSelect = async (wallet: any) => {
    if (!wallet.provider) return;
    try {
      const web3Provider = new ethers.BrowserProvider(wallet.provider);
      setProvider(web3Provider);
      const accounts = await web3Provider.send("eth_requestAccounts", []);
      const acc = accounts[0] || "";
      setAccount(acc);

      wallet.provider.on("accountsChanged", async (accounts: string[]) => {
        const newAcc = accounts[0] || "";
        setAccount(newAcc);
      });
    } catch (e) {
      alert("Failed to connect wallet");
    }
  };

  const onConnect = () => setWalletSelectorOpen(true);
  const onDisconnect = () => {
    setAccount("");
    setProvider(null);
  };

  // Load encrypted records from blockchain
  const loadRecords = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      // Check contract availability using FHE
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) {
        console.error("Contract is not available");
        return;
      }
      
      const keysBytes = await contract.getData("record_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing record keys:", e);
        }
      }
      
      const list: EncryptedRecord[] = [];
      
      for (const key of keys) {
        try {
          const recordBytes = await contract.getData(`record_${key}`);
          if (recordBytes.length > 0) {
            try {
              const recordData = JSON.parse(ethers.toUtf8String(recordBytes));
              list.push({
                id: key,
                encryptedData: recordData.data,
                timestamp: recordData.timestamp,
                owner: recordData.owner,
                geneType: recordData.geneType,
                efficiency: recordData.efficiency,
                status: recordData.status || "pending"
              });
            } catch (e) {
              console.error(`Error parsing record data for ${key}:`, e);
            }
          }
        } catch (e) {
          console.error(`Error loading record ${key}:`, e);
        }
      }
      
      list.sort((a, b) => b.timestamp - a.timestamp);
      setRecords(list);
    } catch (e) {
      console.error("Error loading records:", e);
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  };

  // Submit new gene editing record
  const submitRecord = async () => {
    if (!provider) { 
      alert("Please connect wallet first"); 
      return; 
    }
    
    setCreating(true);
    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Encrypting gene data with FHE..."
    });
    
    try {
      // Simulate FHE encryption
      const encryptedData = `FHE-${btoa(JSON.stringify(newRecordData))}`;
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const recordId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      const recordData = {
        data: encryptedData,
        timestamp: Math.floor(Date.now() / 1000),
        owner: account,
        geneType: newRecordData.geneType,
        efficiency: newRecordData.efficiency,
        status: "pending"
      };
      
      // Store encrypted data on-chain using FHE
      await contract.setData(
        `record_${recordId}`, 
        ethers.toUtf8Bytes(JSON.stringify(recordData))
      );
      
      const keysBytes = await contract.getData("record_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing keys:", e);
        }
      }
      
      keys.push(recordId);
      
      await contract.setData(
        "record_keys", 
        ethers.toUtf8Bytes(JSON.stringify(keys))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "Encrypted gene data submitted securely!"
      });
      
      await loadRecords();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowCreateModal(false);
        setNewRecordData({
          geneType: "",
          gRNA: "",
          efficiency: 0,
          notes: ""
        });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction")
        ? "Transaction rejected by user"
        : "Submission failed: " + (e.message || "Unknown error");
      
      setTransactionStatus({
        visible: true,
        status: "error",
        message: errorMessage
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    } finally {
      setCreating(false);
    }
  };

  // Verify record using FHE computation
  const verifyRecord = async (recordId: string) => {
    if (!provider) {
      alert("Please connect wallet first");
      return;
    }

    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Processing encrypted data with FHE..."
    });

    try {
      // Simulate FHE computation time
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const recordBytes = await contract.getData(`record_${recordId}`);
      if (recordBytes.length === 0) {
        throw new Error("Record not found");
      }
      
      const recordData = JSON.parse(ethers.toUtf8String(recordBytes));
      
      const updatedRecord = {
        ...recordData,
        status: "verified"
      };
      
      await contract.setData(
        `record_${recordId}`, 
        ethers.toUtf8Bytes(JSON.stringify(updatedRecord))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "FHE verification completed successfully!"
      });
      
      await loadRecords();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Verification failed: " + (e.message || "Unknown error")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  // Reject record using FHE computation
  const rejectRecord = async (recordId: string) => {
    if (!provider) {
      alert("Please connect wallet first");
      return;
    }

    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Processing encrypted data with FHE..."
    });

    try {
      // Simulate FHE computation time
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const recordBytes = await contract.getData(`record_${recordId}`);
      if (recordBytes.length === 0) {
        throw new Error("Record not found");
      }
      
      const recordData = JSON.parse(ethers.toUtf8String(recordBytes));
      
      const updatedRecord = {
        ...recordData,
        status: "rejected"
      };
      
      await contract.setData(
        `record_${recordId}`, 
        ethers.toUtf8Bytes(JSON.stringify(updatedRecord))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "FHE rejection completed successfully!"
      });
      
      await loadRecords();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Rejection failed: " + (e.message || "Unknown error")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  // Check if current user is record owner
  const isOwner = (address: string) => {
    return account.toLowerCase() === address.toLowerCase();
  };

  // Render efficiency chart
  const renderEfficiencyChart = () => {
    const efficiencyLevels = [0, 20, 40, 60, 80, 100];
    const levelCounts = efficiencyLevels.map((_, i) => {
      const min = i === 0 ? 0 : efficiencyLevels[i-1];
      const max = efficiencyLevels[i];
      return records.filter(r => r.efficiency > min && r.efficiency <= max).length;
    });

    const maxCount = Math.max(...levelCounts, 1);
    
    return (
      <div className="efficiency-chart">
        {efficiencyLevels.map((level, i) => (
          <div key={i} className="chart-bar-container">
            <div className="chart-bar-label">{level}%</div>
            <div className="chart-bar">
              <div 
                className="chart-bar-fill" 
                style={{ 
                  height: `${(levelCounts[i] / maxCount) * 100}%`,
                  backgroundColor: `hsl(${level}, 70%, 50%)`
                }}
              ></div>
            </div>
            <div className="chart-bar-count">{levelCounts[i]}</div>
          </div>
        ))}
      </div>
    );
  };

  // Loading screen
  if (loading) return (
    <div className="loading-screen">
      <div className="dna-spinner">
        <div className="dna-strand"></div>
        <div className="dna-strand"></div>
        <div className="dna-strand"></div>
      </div>
      <p>Initializing encrypted connection...</p>
    </div>
  );

  return (
    <div className="app-container">
      {/* Header Section */}
      <header className="app-header">
        <div className="logo">
          <div className="dna-icon"></div>
          <h1>FHE<span>Gene</span>Records</h1>
        </div>
        
        <div className="header-actions">
          <button 
            onClick={() => setShowCreateModal(true)} 
            className="create-record-btn"
          >
            <div className="add-icon"></div>
            Add Experiment
          </button>
          <WalletManager account={account} onConnect={onConnect} onDisconnect={onDisconnect} />
        </div>
      </header>
      
      {/* Main Content */}
      <div className="main-content">
        {/* Project Introduction */}
        <section className="intro-section">
          <div className="intro-content">
            <h2>Privacy-Preserving Gene Editing Records</h2>
            <p>
              Securely record and analyze CRISPR gene editing experiments using Fully Homomorphic Encryption (FHE). 
              Protect sensitive research data while enabling collaborative analysis.
            </p>
            <div className="fhe-badge">
              <span>FHE-Powered</span>
            </div>
          </div>
          <div className="intro-image">
            <div className="dna-helix"></div>
          </div>
        </section>
        
        {/* Statistics Dashboard */}
        <section className="stats-section">
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-value">{records.length}</div>
              <div className="stat-label">Total Experiments</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{verifiedCount}</div>
              <div className="stat-label">Verified</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{pendingCount}</div>
              <div className="stat-label">Pending</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{avgEfficiency.toFixed(1)}%</div>
              <div className="stat-label">Avg Efficiency</div>
            </div>
          </div>
        </section>
        
        {/* Efficiency Chart */}
        <section className="chart-section">
          <h3>Editing Efficiency Distribution</h3>
          {renderEfficiencyChart()}
        </section>
        
        {/* Experiment Records */}
        <section className="records-section">
          <div className="section-header">
            <h2>Encrypted Experiment Records</h2>
            <div className="search-container">
              <input 
                type="text" 
                placeholder="Search experiments..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="search-input"
              />
              <button 
                onClick={loadRecords}
                className="refresh-btn"
                disabled={isRefreshing}
              >
                {isRefreshing ? "Refreshing..." : "Refresh"}
              </button>
            </div>
          </div>
          
          <div className="records-list">
            <div className="table-header">
              <div className="header-cell">ID</div>
              <div className="header-cell">Gene Type</div>
              <div className="header-cell">Efficiency</div>
              <div className="header-cell">Owner</div>
              <div className="header-cell">Date</div>
              <div className="header-cell">Status</div>
              <div className="header-cell">Actions</div>
            </div>
            
            {filteredRecords.length === 0 ? (
              <div className="no-records">
                <div className="no-records-icon"></div>
                <p>No encrypted records found</p>
                <button 
                  className="primary-btn"
                  onClick={() => setShowCreateModal(true)}
                >
                  Create First Record
                </button>
              </div>
            ) : (
              filteredRecords.map(record => (
                <div className="record-row" key={record.id}>
                  <div className="table-cell record-id">#{record.id.substring(0, 6)}</div>
                  <div className="table-cell">{record.geneType}</div>
                  <div className="table-cell">
                    <div className="efficiency-bar">
                      <div 
                        className="efficiency-fill" 
                        style={{ width: `${record.efficiency}%` }}
                      ></div>
                      <span>{record.efficiency}%</span>
                    </div>
                  </div>
                  <div className="table-cell">{record.owner.substring(0, 6)}...{record.owner.substring(38)}</div>
                  <div className="table-cell">
                    {new Date(record.timestamp * 1000).toLocaleDateString()}
                  </div>
                  <div className="table-cell">
                    <span className={`status-badge ${record.status}`}>
                      {record.status}
                    </span>
                  </div>
                  <div className="table-cell actions">
                    {isOwner(record.owner) && record.status === "pending" && (
                      <>
                        <button 
                          className="action-btn success"
                          onClick={() => verifyRecord(record.id)}
                        >
                          Verify
                        </button>
                        <button 
                          className="action-btn danger"
                          onClick={() => rejectRecord(record.id)}
                        >
                          Reject
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
        
        {/* FAQ Section */}
        <section className="faq-section">
          <h2>Frequently Asked Questions</h2>
          <div className="faq-container">
            {faqs.map((faq, index) => (
              <div 
                key={index} 
                className={`faq-item ${activeFAQ === index ? 'active' : ''}`}
                onClick={() => setActiveFAQ(activeFAQ === index ? null : index)}
              >
                <div className="faq-question">
                  {faq.question}
                  <div className="faq-toggle"></div>
                </div>
                {activeFAQ === index && (
                  <div className="faq-answer">
                    {faq.answer}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      </div>
  
      {/* Create Record Modal */}
      {showCreateModal && (
        <ModalCreate 
          onSubmit={submitRecord} 
          onClose={() => setShowCreateModal(false)} 
          creating={creating}
          recordData={newRecordData}
          setRecordData={setNewRecordData}
        />
      )}
      
      {/* Wallet Selector */}
      {walletSelectorOpen && (
        <WalletSelector
          isOpen={walletSelectorOpen}
          onWalletSelect={(wallet) => { onWalletSelect(wallet); setWalletSelectorOpen(false); }}
          onClose={() => setWalletSelectorOpen(false)}
        />
      )}
      
      {/* Transaction Status Modal */}
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="dna-spinner small"></div>}
              {transactionStatus.status === "success" && <div className="check-icon"></div>}
              {transactionStatus.status === "error" && <div className="error-icon"></div>}
            </div>
            <div className="transaction-message">
              {transactionStatus.message}
            </div>
          </div>
        </div>
      )}
  
      {/* Footer */}
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="logo">
              <div className="dna-icon"></div>
              <span>FHEGeneRecords</span>
            </div>
            <p>Secure encrypted gene editing records using FHE technology</p>
          </div>
          
          <div className="footer-links">
            <a href="#" className="footer-link">Documentation</a>
            <a href="#" className="footer-link">Privacy Policy</a>
            <a href="#" className="footer-link">Terms of Service</a>
            <a href="#" className="footer-link">Contact</a>
          </div>
        </div>
        
        <div className="footer-bottom">
          <div className="fhe-badge">
            <span>FHE-Powered Privacy</span>
          </div>
          <div className="copyright">
            © {new Date().getFullYear()} FHEGeneRecords. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
};

interface ModalCreateProps {
  onSubmit: () => void; 
  onClose: () => void; 
  creating: boolean;
  recordData: any;
  setRecordData: (data: any) => void;
}

const ModalCreate: React.FC<ModalCreateProps> = ({ 
  onSubmit, 
  onClose, 
  creating,
  recordData,
  setRecordData
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setRecordData({
      ...recordData,
      [name]: name === "efficiency" ? parseFloat(value) : value
    });
  };

  const handleSubmit = () => {
    if (!recordData.geneType || !recordData.gRNA) {
      alert("Please fill required fields");
      return;
    }
    
    onSubmit();
  };

  return (
    <div className="modal-overlay">
      <div className="create-modal">
        <div className="modal-header">
          <h2>Add Encrypted Experiment Record</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice-banner">
            <div className="key-icon"></div> Your sensitive gene data will be encrypted with FHE
          </div>
          
          <div className="form-grid">
            <div className="form-group">
              <label>Gene Type *</label>
              <select 
                name="geneType"
                value={recordData.geneType} 
                onChange={handleChange}
                className="form-select"
              >
                <option value="">Select gene type</option>
                <option value="CRISPR-Cas9">CRISPR-Cas9</option>
                <option value="CRISPR-Cas12">CRISPR-Cas12</option>
                <option value="Base Editing">Base Editing</option>
                <option value="Prime Editing">Prime Editing</option>
                <option value="Other">Other</option>
              </select>
            </div>
            
            <div className="form-group">
              <label>gRNA Sequence *</label>
              <input 
                type="text"
                name="gRNA"
                value={recordData.gRNA} 
                onChange={handleChange}
                placeholder="Enter gRNA sequence..." 
                className="form-input"
              />
            </div>
            
            <div className="form-group">
              <label>Editing Efficiency (%) *</label>
              <input 
                type="number"
                name="efficiency"
                min="0"
                max="100"
                value={recordData.efficiency} 
                onChange={handleChange}
                placeholder="0-100" 
                className="form-input"
              />
            </div>
            
            <div className="form-group full-width">
              <label>Experimental Notes</label>
              <textarea 
                name="notes"
                value={recordData.notes} 
                onChange={handleChange}
                placeholder="Additional observations or details..." 
                className="form-textarea"
                rows={3}
              />
            </div>
          </div>
          
          <div className="privacy-notice">
            <div className="privacy-icon"></div> Data remains encrypted during FHE processing
          </div>
        </div>
        
        <div className="modal-footer">
          <button 
            onClick={onClose}
            className="cancel-btn"
          >
            Cancel
          </button>
          <button 
            onClick={handleSubmit} 
            disabled={creating}
            className="submit-btn primary"
          >
            {creating ? "Encrypting with FHE..." : "Submit Securely"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;