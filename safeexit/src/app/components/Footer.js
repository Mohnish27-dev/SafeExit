"use client";

import { Shield, Mail, Phone, MapPin, Globe } from "lucide-react";

export default function Footer() {
  return (
    <footer className="bg-gradient-to-b from-[#0b1120] to-[#0a0f1f] border-t border-slate-800 text-slate-400 py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        <div className="grid grid-cols-1 md:grid-cols-12 gap-10">
          
          {/* Brand Info */}
          <div className="md:col-span-5 space-y-4">
            <div className="flex items-center gap-2">
              <div className="h-9 w-9 rounded-lg bg-indigo-600 flex items-center justify-center text-white">
                <Shield className="h-5 w-5" />
              </div>
              <span className="font-display text-lg font-bold tracking-tight text-white">
                Safe<span className="text-indigo-500">Exit</span>
              </span>
            </div>
            <p className="text-sm font-medium text-slate-400 leading-relaxed max-w-sm">
                SafeExit delivers privacy-first campus safety. By replacing exposed paper registers with encrypted digital checkpoints, we protect students and reinforce institutional accountability.
            </p>
          </div>

          {/* Quick Links */}
          <div className="md:col-span-3 space-y-4">
            <h4 className="text-white font-bold text-sm tracking-wider uppercase">Platform</h4>
            <ul className="space-y-2.5 text-sm font-medium">
              <li>
                <a href="#features" className="hover:text-indigo-400 transition-colors">
                  Features
                </a>
              </li>
              <li>
                <a href="#how-it-works" className="hover:text-indigo-400 transition-colors">
                  How It Works
                </a>
              </li>
              <li>
                <a href="#security" className="hover:text-indigo-400 transition-colors">
                  Security Measures
                </a>
              </li>
              <li>
                <a href="#simulator" className="hover:text-indigo-400 transition-colors">
                  System Simulator
                </a>
              </li>
            </ul>
          </div>

          {/* Contact Details */}
          <div className="md:col-span-4 space-y-4">
            <h4 className="text-white font-bold text-sm tracking-wider uppercase">Get In Touch</h4>
            <ul className="space-y-3 text-sm font-medium text-slate-400">
              <li className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-indigo-500" />
                <span>support@safeexit.edu</span>
              </li>
              <li className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-indigo-500" />
                <span>+91 1800 123 4567</span>
              </li>
              <li className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-indigo-500" />
                <span>Safety Inc., Tech Hub Sector 12, India</span>
              </li>
            </ul>
          </div>

        </div>

        {/* Bottom Bar */}
        <div className="border-t border-slate-800 mt-12 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-semibold text-slate-500">
          <p>© {new Date().getFullYear()} SafeExit. Built for Student Safety & Accountability.</p>
          <div className="flex gap-6">
            <a href="#" className="hover:text-indigo-400 transition-colors">
              Privacy Policy
            </a>
            <a href="#" className="hover:text-indigo-400 transition-colors">
              Terms of Use
            </a>
            <a href="#" className="hover:text-indigo-400 transition-colors">
              ICC Regulations
            </a>
          </div>
        </div>

      </div>
    </footer>
  );
}
