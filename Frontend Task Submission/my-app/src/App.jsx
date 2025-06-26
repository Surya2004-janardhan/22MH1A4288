import React, { useState, useEffect } from 'react';
import "./App.css"
import { Link2, BarChart3, Clock, Copy, ExternalLink } from 'lucide-react';

const API_BASE_URL = 'http://localhost:3001';

const logToServer = async (stack, level, packageName, message) => {
  try {
    await fetch('http://20.244.56.144/evaluation-service/logs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ stack, level, package: packageName, message })
    });
  } catch (error) {
    console.error('Error logging to server:', error);
  }
};

const App = () => {
  const [currentPage, setCurrentPage] = useState('shortener');
  const [formData, setFormData] = useState({ url: '', validity: 30, shortcode: '' });
  const [shortenedUrls, setShortenedUrls] = useState([]);
  const [allUrls, setAllUrls] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (currentPage === 'statistics') {
      fetchAllUrls();
    }
  }, [currentPage]);

  const fetchAllUrls = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/all-urls`);
      if (response.ok) {
        const data = await response.json();
        setAllUrls(data);
        await logToServer('frontend', 'info', 'api', 'All URLs fetched successfully');
      }
    } catch (error) {
      await logToServer('frontend', 'error', 'api', `Error fetching all URLs: ${error.message}`);
    }
  };

  const validateForm = () => {
    if (!formData.url.trim()) return setError('URL is required') || false;
    try { new URL(formData.url); } catch { return setError('Enter a valid URL') || false; }
    if (formData.validity <= 0 || !Number.isInteger(+formData.validity)) return setError('Validity must be positive') || false;
    if (formData.shortcode && !/^[a-zA-Z0-9]+$/.test(formData.shortcode)) return setError('Shortcode invalid') || false;
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (!validateForm()) return;
    setLoading(true);
    try {
      const payload = { url: formData.url, validity: parseInt(formData.validity) };
      if (formData.shortcode.trim()) payload.shortcode = formData.shortcode;
      const response = await fetch(`${API_BASE_URL}/shorturls`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (response.ok) {
        const newUrl = { shortLink: data.shortLink, originalUrl: formData.url, expiry: data.expiry, createdAt: new Date().toISOString() };
        setShortenedUrls(prev => [newUrl, ...prev]);
        setSuccess('URL shortened successfully!');
        setFormData({ url: '', validity: 30, shortcode: '' });
        await logToServer('frontend', 'info', 'component', 'URL shortened successfully');
      } else {
        setError(data.error || 'Failed to shorten URL');
        await logToServer('frontend', 'error', 'component', `Shortening failed: ${data.error}`);
      }
    } catch (error) {
      setError('Network error');
      await logToServer('frontend', 'error', 'component', `Network error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setSuccess('Copied to clipboard!');
      setTimeout(() => setSuccess(''), 3000);
    } catch (error) {
      await logToServer('frontend', 'error', 'component', `Copy failed: ${error.message}`);
    }
  };

  const formatDate = (dateString) => new Date(dateString).toLocaleString();
  const isExpired = (expiryDate) => new Date() > new Date(expiryDate);

  return (
    <div className="container">
      <header>
        <h1><Link2 /> URL Shortener</h1>
        <nav>
          <button onClick={() => setCurrentPage('shortener')} className={currentPage === 'shortener' ? 'active' : ''}>Shortener</button>
          <button onClick={() => setCurrentPage('statistics')} className={currentPage === 'statistics' ? 'active' : ''}>Statistics</button>
        </nav>
      </header>

      <main>
        {currentPage === 'shortener' && (
          <section>
            <form onSubmit={handleSubmit}>
              <input type="url" placeholder="Original URL" value={formData.url} onChange={(e) => setFormData({ ...formData, url: e.target.value })} required />
              <input type="number" placeholder="Validity (min)" value={formData.validity} onChange={(e) => setFormData({ ...formData, validity: +e.target.value })} />
              <input type="text" placeholder="Custom shortcode (optional)" value={formData.shortcode} onChange={(e) => setFormData({ ...formData, shortcode: e.target.value })} />
              <button type="submit" disabled={loading}>{loading ? 'Shortening...' : 'Shorten'}</button>
              {error && <p className="error">{error}</p>}
              {success && <p className="success">{success}</p>}
            </form>

            {shortenedUrls.length > 0 && (
              <div className="results">
                <h2>Shortened URLs</h2>
                {shortenedUrls.map((url, i) => (
                  <div key={i} className="url-card">
                    <p>{url.originalUrl}</p>
                    <a href={url.shortLink} target="_blank" rel="noreferrer">{url.shortLink}</a>
                    <button onClick={() => copyToClipboard(url.shortLink)}><Copy /></button>
                    <small>Expires: {formatDate(url.expiry)}</small>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {currentPage === 'statistics' && (
          <section>
            <button onClick={fetchAllUrls}>Refresh Data</button>
            {allUrls.length === 0 ? <p>No data available</p> : (
              <table>
                <thead>
                  <tr>
                    <th>Short URL</th>
                    <th>Original URL</th>
                    <th>Created</th>
                    <th>Expires</th>
                    <th>Clicks</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {allUrls.map((url, i) => (
                    <tr key={i}>
                      <td>{url.shortCode}</td>
                      <td>{url.originalUrl}</td>
                      <td>{formatDate(url.createdAt)}</td>
                      <td>{formatDate(url.expiryDate)}</td>
                      <td>{url.totalClicks}</td>
                      <td>{isExpired(url.expiryDate) ? 'Expired' : 'Active'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        )}
      </main>
    </div>
  );
};

export default App;
