'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/app/lib/auth-context';
import {
  CalendarDays,
  CheckSquare,
  FileCheck2,
  FileText,
  Files,
  LayoutGrid,
  LogOut,
  Shield,
  Upload,
  ChevronRight,
} from 'lucide-react';

interface NavItem {
  name: string;
  href: string;
  icon: React.ReactNode;
  activePaths?: string[];
}

interface SidebarV2Props {
  mobileOpen?: boolean;
  onMobileOpenChange?: (open: boolean) => void;
}

const SidebarV2: React.FC<SidebarV2Props> = ({ mobileOpen = false, onMobileOpenChange }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { logout, user } = useAuth();

  const expanded = isMobile ? mobileOpen : isExpanded;

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
      if (window.innerWidth < 768) {
        setIsExpanded(false);
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const navItems: NavItem[] = [
    {
      name: 'Overview',
      href: '/dashboard',
      icon: <LayoutGrid className="w-5 h-5" />,
      activePaths: ['/dashboard'],
    },
    {
      name: 'Drafting',
      href: '/create-contract',
      icon: <FileText className="w-5 h-5" />,
      activePaths: ['/create-contract'],
    },
    {
      name: 'Templates',
      href: '/templates',
      icon: <Files className="w-5 h-5" />,
      activePaths: ['/templates'],
    },
    {
      name: 'Contracts',
      href: '/contracts',
      icon: <FileText className="w-5 h-5" />,
      activePaths: ['/contracts', '/contracts/'],
    },
    {
      name: 'Signing Requests',
      href: '/signing-requests',
      icon: <CheckSquare className="w-5 h-5" />,
      activePaths: ['/signing-requests', '/signing-requests/'],
    },
    {
      name: 'Uploads',
      href: '/uploads',
      icon: <Upload className="w-5 h-5" />,
      activePaths: ['/uploads'],
    },
    {
      name: 'Review',
      href: '/review',
      icon: <FileCheck2 className="w-5 h-5" />,
      activePaths: ['/review', '/review/'],
    },
    {
      name: 'Calendar',
      href: '/calendar',
      icon: <CalendarDays className="w-5 h-5" />,
      activePaths: ['/calendar'],
    },
  ];

  if ((user as any)?.is_admin) {
    navItems.push({
      name: 'Admin',
      href: '/admin',
      icon: <Shield className="w-5 h-5" />,
      activePaths: ['/admin', '/admin/'],
    });
  }

  const isActive = (navItem: NavItem): boolean => {
    const paths = navItem.activePaths || [];
    for (const p of paths) {
      if (!p) continue;
      if (p === pathname) return true;
      // Treat paths ending with '/' as prefix matches for dynamic routes.
      if (p.endsWith('/') && pathname.startsWith(p)) return true;
    }
    return false;
  };

  const handleLogout = async () => {
    if (window.confirm('Are you sure you want to logout?')) {
      await logout();
      router.push('/');
    }
  };

  return (
    <>
      {/* Overlay for mobile */}
      {isMobile && expanded && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => onMobileOpenChange?.(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed left-0 top-0 h-screen bg-[#0F141F] z-50 transition-all duration-300 flex flex-col ${
          expanded ? 'w-64' : 'w-[88px]'
        } ${isMobile && !expanded ? '-translate-x-full' : 'translate-x-0'}`}
        onMouseEnter={() => !isMobile && setIsExpanded(true)}
        onMouseLeave={() => !isMobile && setIsExpanded(false)}
      >
        {/* Logo Section */}
        <div className="flex items-center h-20 px-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#FF5C7A] rounded-xl flex items-center justify-center flex-shrink-0">
              <span className="text-white font-bold text-lg">C</span>
            </div>
            {expanded && (
              <div className="flex flex-col">
                <span className="text-white font-bold text-base whitespace-nowrap">ContractFlow</span>
                <span className="text-white/50 text-xs whitespace-nowrap">Workspace</span>
              </div>
            )}
          </div>

          {/* Mobile toggle */}
          {isMobile && (
            <button
              onClick={() => onMobileOpenChange?.(false)}
              className="ml-auto p-2 rounded-lg hover:bg-white/10 text-white/70"
              aria-label="Close sidebar"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 overflow-y-auto py-2 px-4 space-y-2">
          {navItems.map((item) => {
            const active = isActive(item);
            return (
              <Link key={item.href} href={item.href}>
                <div
                  className={`relative flex items-center gap-3 rounded-2xl transition-all duration-200 cursor-pointer ${
                    expanded ? 'px-4 py-3' : 'px-0 py-3 justify-center'
                  } ${
                    active
                      ? 'text-white bg-white/10'
                      : 'text-white/55 hover:text-white/90 hover:bg-white/5'
                  }`}
                >
                  {active && (
                    <div className="absolute -left-4 top-1/2 -translate-y-1/2 w-1 h-8 bg-[#FF5C7A] rounded-r-full" />
                  )}

                  <div className="flex-shrink-0">{item.icon}</div>
                  {expanded && <span className="font-medium text-sm whitespace-nowrap">{item.name}</span>}
                </div>
              </Link>
            );
          })}
        </nav>

        {/* User Profile & Logout */}
        <div className="mt-auto px-4 pb-6">
          <div
            className={`${
              expanded
                ? 'flex items-center gap-3 px-2 py-3 rounded-2xl hover:bg-white/5'
                : 'flex justify-center py-3'
            } transition`}
          >
            <button
              type="button"
              onClick={() => {
                if (isMobile) onMobileOpenChange?.(false);
                router.push('/settings');
              }}
              className={`${expanded ? 'flex items-center gap-3 flex-1 min-w-0' : 'flex items-center'} rounded-2xl hover:bg-white/5 transition px-2 py-1.5`}
              aria-label="Open profile"
              title="Profile"
            >
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#FF5C7A] to-[#8B5CF6] flex items-center justify-center text-white font-semibold flex-shrink-0 ring-1 ring-white/10">
                {(user?.email?.[0] || 'U').toUpperCase()}
              </div>
              {expanded && (
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-white text-sm font-medium truncate">{user?.email || 'User'}</p>
                  <p className="text-white/45 text-xs truncate">{(user as any)?.is_admin ? 'Admin' : 'User'}</p>
                </div>
              )}
              {expanded && <ChevronRight className="w-4 h-4 text-white/40 flex-shrink-0" />}
            </button>
            {expanded && (
              <button
                onClick={handleLogout}
                className="p-2 rounded-lg hover:bg-white/10 text-white/60 hover:text-white"
                aria-label="Logout"
                title="Logout"
              >
                <LogOut className="w-5 h-5" />
              </button>
            )}
            {!expanded && (
              <button
                onClick={handleLogout}
                className="p-2 rounded-2xl hover:bg-white/10 text-white/60 hover:text-white"
                aria-label="Logout"
                title="Logout"
              >
                <LogOut className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* Spacer for non-mobile, overlap handler for mobile */}
      <div
        className={`hidden md:block transition-all duration-300 ${
          isExpanded ? 'w-64' : 'w-[88px]'
        }`}
      />
    </>
  );
};

export default SidebarV2;
