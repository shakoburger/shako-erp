'use client';
import {createContext,useContext} from 'react';
import {roleAccess,type Access} from '@/lib/access';
import {defaults,type Settings} from '@/lib/domain';
export const AgencyAccess=createContext<Access>(roleAccess('viewer'));
export const useAgencyAccess=()=>useContext(AgencyAccess);
export const AgencySettings=createContext<Settings>(defaults);
export const useAgencySettings=()=>useContext(AgencySettings);
