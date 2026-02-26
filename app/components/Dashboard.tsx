'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from './Sidebar';

// Type definitions
interface Statistics {
  total: number;
  draft: number;
  pending: number;
  approved: number;
  rejected: number;
  monthly_trends?: Array<{
    month: string;
    approved: number;
  }>;
}

interface Contract {
  id: string;
  title: string;
  contract_title?: string;
  status: string;
  created_at: string;
  updated_at?: string;
}

const Dashboard = () => {
  const router = useRouter();
  const [stats, setStats] = useState<Statistics | null>(null);
  const [recentContracts, setRecentContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Base URL (no trailing /api). Endpoints are under /api/v1
  const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://lawflow-267708864896.asia-south1.run.app';
  
  // Helper to get token from localStorage
  const getToken = () => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('access_token');
    }
    return null;
  };

  const fetchDashboardData = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const token = getToken();
      
      if (!token) {
        setError('Authentication required');
        setLoading(false);
        return;
      }

      const headers = { 
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json' 
      };

      // Fetch Statistics (Cards & Charts)
      const statsRes = await fetch(`${BASE_URL}/api/v1/contracts/statistics/`, { headers });
      if (!statsRes.ok) throw new Error('Failed to fetch statistics');
      const statsData = await statsRes.json();
      
      // Fetch Recent Contracts (List)
      const recentRes = await fetch(`${BASE_URL}/api/v1/contracts/recent/`, { headers });
      if (!recentRes.ok) throw new Error('Failed to fetch recent contracts');
      const recentData = await recentRes.json();

      setStats(statsData);
      setRecentContracts(recentData);
    } catch (err) {
      console.error("Sync failed", err);
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  // Helper function to get status pill styling
  const getStatusStyles = (status: string) => {
    const normalizedStatus = status?.toLowerCase() || '';
    
    if (normalizedStatus.includes('approved')) {
      return 'bg-green-100 text-green-700';
    } else if (normalizedStatus.includes('draft')) {
      return 'bg-yellow-100 text-yellow-700';
    } else if (normalizedStatus.includes('pending')) {
      return 'bg-blue-100 text-blue-700';
    } else if (normalizedStatus.includes('rejected')) {
      return 'bg-red-100 text-red-700';
    }
    return 'bg-gray-100 text-gray-700';
  };

  return (
    <div className="bg-[#F2F0EB] min-h-screen font-sans">
      <Sidebar />
      
      <main className="ml-[90px] p-8">
        {/* Header with Spinning Wheel */}
        <header className="flex justify-between items-center mb-10">
          <div>
            <h1 className="text-4xl font-bold text-[#2D3748]">Overview</h1>
            <p className="text-gray-500 mt-1">Welcome back! Here&apos;s what&apos;s happening today.</p>
          </div>
          <div className="flex items-center gap-4">
            {loading && (
              <div className="flex items-center text-sm text-gray-500">
                {/* Spinning Wheel Icon */}
                <svg className="animate-spin h-5 w-5 mr-2 text-indigo-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                </svg>
                Syncing Data...
              </div>
            )}
            
            {/* Search Icon */}
            <button className="p-3 rounded-full hover:bg-white/50 transition">
              <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </button>
            
            {/* Notification Bell */}
            <button className="relative p-3 rounded-full hover:bg-white/50 transition">
              <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full"></span>
            </button>
            
            {/* New Contract Button */}
            <button
              onClick={() => router.push('/create-contract')}
              className="bg-[#0F141F] text-white px-6 py-3 rounded-full shadow-lg hover:shadow-xl hover:scale-105 transition-all flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Contract
            </button>
          </div>
        </header>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-6 py-4 rounded-2xl mb-6">
            <p className="font-medium">Error loading data: {error}</p>
          </div>
        )}

        {/* Hero & Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
          {/* Hero Card - Coral Gradient (spans 2 columns) */}
          <div className="lg:col-span-2 rounded-[24px] p-8 text-white shadow-2xl relative overflow-hidden" 
               style={{ background: 'linear-gradient(135deg, #FF7E5F 0%, #FEB47B 100%)' }}>
            <div className="relative z-10">
              <div className="flex justify-between items-start mb-2">
                <h3 className="opacity-90 text-lg font-medium">Total Contracts</h3>
                <button className="text-white/80 hover:text-white">
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                  </svg>
                </button>
              </div>
              <div className="text-6xl font-bold mt-4 mb-6">
                {stats?.total.toLocaleString() || '0'}
              </div>
              
              {/* Trend Indicator */}
              <div className="flex items-center gap-3">
                <div className="flex items-center bg-white/20 backdrop-blur-sm px-4 py-2 rounded-full text-sm font-medium">
                  <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                  </svg>
                  <span>+11.01%</span>
                </div>
                <span className="text-white/80 text-sm">from last week</span>
              </div>
              
              {/* Decorative Wave */}
              <svg className="absolute bottom-0 left-0 right-0 opacity-20" viewBox="0 0 1200 120" preserveAspectRatio="none">
                <path d="M0,0V46.29c47.79,22.2,103.59,32.17,158,28,70.36-5.37,136.33-33.31,206.8-37.5C438.64,32.43,512.34,53.67,583,72.05c69.27,18,138.3,24.88,209.4,13.08,36.15-6,69.85-17.84,104.45-29.34C989.49,25,1113-14.29,1200,52.47V0Z" opacity=".25"></path>
                <path d="M0,0V15.81C13,36.92,27.64,56.86,47.69,72.05,99.41,111.27,165,111,224.58,91.58c31.15-10.15,60.09-26.07,89.67-39.8,40.92-19,84.73-46,130.83-49.67,36.26-2.85,70.9,9.42,98.6,31.56,31.77,25.39,62.32,62,103.63,73,40.44,10.79,81.35-6.69,119.13-24.28s75.16-39,116.92-43.05c59.73-5.85,113.28,22.88,168.9,38.84,30.2,8.66,59,6.17,87.09-7.5,22.43-10.89,48-26.93,60.65-49.24V0Z" opacity=".5"></path>
                <path d="M0,0V5.63C149.93,59,314.09,71.32,475.83,42.57c43-7.64,84.23-20.12,127.61-26.46,59-8.63,112.48,12.24,165.56,35.4C827.93,77.22,886,95.24,951.2,90c86.53-7,172.46-45.71,248.8-84.81V0Z"></path>
              </svg>
            </div>
          </div>

          {/* Draft Card */}
          <div className="bg-white rounded-[24px] p-6 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start mb-3">
              <h3 className="text-gray-500 text-sm font-medium">Drafts</h3>
              <div className="p-2 bg-yellow-50 rounded-lg">
                <svg className="w-5 h-5 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
            </div>
            <div className="text-4xl font-bold text-[#0F141F] mb-4">{stats?.draft || 0}</div>
            
            {/* Progress Bar (Donut Chart Alternative) */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-gray-500">
                <span>In Progress</span>
                <span>{stats?.draft || 0} contracts</span>
              </div>
              <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-yellow-400 to-yellow-500 rounded-full transition-all" 
                  style={{ width: `${stats ? Math.min((stats.draft / stats.total) * 100, 100) : 0}%` }}
                ></div>
              </div>
            </div>
          </div>

          {/* Approved Card */}
          <div className="bg-white rounded-[24px] p-6 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start mb-3">
              <h3 className="text-gray-500 text-sm font-medium">Approved</h3>
              <div className="p-2 bg-green-50 rounded-lg">
                <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
            <div className="text-4xl font-bold text-[#0F141F] mb-2">{stats?.approved || 0}</div>
            <div className="text-sm text-green-500 font-medium flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Ready for execution
            </div>
          </div>
        </div>

        {/* Secondary Stats Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
          {/* Pending Card */}
          <div className="bg-white rounded-[20px] p-6 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-gray-500 text-sm mb-2">Pending Review</h3>
                <div className="text-3xl font-bold text-[#0F141F]">{stats?.pending || 0}</div>
              </div>
              <div className="p-4 bg-blue-50 rounded-2xl">
                <svg className="w-8 h-8 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
          </div>

          {/* Rejected Card */}
          <div className="bg-white rounded-[20px] p-6 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-gray-500 text-sm mb-2">Rejected</h3>
                <div className="text-3xl font-bold text-[#0F141F]">{stats?.rejected || 0}</div>
              </div>
              <div className="p-4 bg-red-50 rounded-2xl">
                <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
          </div>

          {/* Completion Rate */}
          <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-[20px] p-6 shadow-lg text-white">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-white/80 text-sm mb-2">Completion Rate</h3>
                <div className="text-3xl font-bold">
                  {stats ? Math.round((stats.approved / stats.total) * 100) : 0}%
                </div>
              </div>
              <div className="p-4 bg-white/20 backdrop-blur-sm rounded-2xl">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Contracts List */}
        <div className="bg-transparent">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-2xl font-bold text-[#2D3748]">Recent Contracts</h3>
            <button className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-2">
              View All
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
          
          <div className="space-y-3">
            {recentContracts.map((contract, index) => (
              <div 
                key={contract.id || index} 
                className="bg-white p-5 rounded-[20px] flex items-center justify-between shadow-sm hover:shadow-lg transition-all cursor-pointer group"
              >
                <div className="flex items-center gap-4">
                  {/* Document Icon */}
                  <div className="h-12 w-12 bg-gradient-to-br from-indigo-50 to-indigo-100 rounded-2xl flex items-center justify-center text-indigo-600 group-hover:scale-110 transition-transform">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                    </svg>
                  </div>
                  
                  <div>
                    <h4 className="font-bold text-[#2D3748] text-base group-hover:text-indigo-600 transition-colors">
                      {contract.title || contract.contract_title || `Contract #${index + 1}`}
                    </h4>
                    <p className="text-xs text-gray-400 mt-1">
                      Updated {new Date(contract.updated_at || contract.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center gap-4">
                  {/* Status Pill */}
                  <span className={`px-4 py-2 rounded-full text-xs font-bold ${getStatusStyles(contract.status)}`}>
                    {contract.status || "Pending"}
                  </span>
                  
                  {/* More Options */}
                  <button className="text-gray-400 hover:text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity">
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
          
          {recentContracts.length === 0 && !loading && (
            <div className="bg-white rounded-[20px] p-12 text-center">
              <svg className="w-16 h-16 mx-auto text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <h3 className="text-gray-500 font-medium">No contracts yet</h3>
              <p className="text-gray-400 text-sm mt-2">Get started by creating your first contract</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
