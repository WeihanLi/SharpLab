import React, { createContext, ReactNode, useEffect, useMemo, useReducer, useState } from 'react';
import { useRecoilState } from 'recoil';
import getBranchesAsync from '../../ts/server/get-branches-async';
import defaults from '../../ts/state/handlers/defaults';
import { AppStateData, loadStateAsync, saveState } from '../../ts/state/state';
import type { AppOptions } from '../../ts/types/app';
import { resolveBranchAsync } from '../../ts/ui/branches';
import type { CachedUpdateResult } from '../features/result-cache/types';
import { gistState } from '../features/save-as-gist/gistState';
import { useAsync } from '../helpers/useAsync';
import { BranchesContext } from '../shared/contexts/BranchesContext';
import { OptionName, optionContexts } from '../shared/contexts/optionContexts';
import { ResultContext } from '../shared/contexts/ResultContext';
import { branchOptionState } from '../shared/state/branchOptionState';
import { codeState } from '../shared/state/codeState';
import { languageOptionState } from '../shared/state/languageOptionState';
import { targetOptionState } from '../shared/state/targetOptionState';
import type { Branch } from '../shared/types/Branch';
import { MutableValueProvider } from './state/MutableValueProvider';
import { resultReducer } from './state/resultReducer';

export const InitialCodeContext = createContext<string>('');
type LegacyOptions = Pick<AppOptions, 'release'>;

const EMPTY_BRANCHES = [] as ReadonlyArray<Branch>;
export const AppStateManager = ({ children }: { children: ReactNode }) => {
    const [options, setOptions] = useState<LegacyOptions>();
    const [language, setLanguage] = useRecoilState(languageOptionState);
    const [branch, setBranch] = useRecoilState(branchOptionState);
    const [target, setTarget] = useRecoilState(targetOptionState);
    const [initialCode, setInitialCode] = useState<string>('');
    const [code, setCode] = useRecoilState(codeState);
    // TODO: This should be moved into the Gist feature for clearer responsibility split
    const [gist, setGist] = useRecoilState(gistState);
    // eslint-disable-next-line no-undefined
    const [result, dispatchResultAction] = useReducer(resultReducer, undefined);
    const resultContext = useMemo(() => [result, dispatchResultAction] as const, [result]);

    const [startBranchesLoad, branches] = useAsync(getBranchesAsync, []);
    const [startStateLoad, loadedState] = useAsync(async () => {
        const state = {} as Partial<AppStateData>;
        const setResultFromCache = (updateResult: CachedUpdateResult, { target }: AppOptions) => dispatchResultAction({
            type: 'cachedResult', updateResult, target
        });

        await loadStateAsync(state, { resolveBranchAsync, setResultFromCache });
        return state as AppStateData;
    }, []);

    useEffect(() => {
        startBranchesLoad();
        startStateLoad();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (!loadedState)
            return;
        setOptions(loadedState.options);
        setLanguage(loadedState.options.language);
        setBranch(loadedState.options.branch);
        setTarget(loadedState.options.target);
        setInitialCode(loadedState.code);
        setCode(loadedState.code);
        setGist(loadedState.gist);
    }, [loadedState, setLanguage, setBranch, setTarget, setCode, setGist]);

    useEffect(() => {
        if (!options)
            return;
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (!language || !target)
            return;
        const loaded = loadedState?.options;
        if (language !== loaded?.language || target !== loaded.target)
            setInitialCode(defaults.getCode(language, target));
    }, [loadedState, language, target, options]);

    useEffect(() => {
        if (!loadedState || !options)
            return;
        const sameAsLoaded = language === loadedState.options.language
            && branch === loadedState.options.branch
            && target === loadedState.options.target
            && options.release === loadedState.options.release
            && code === loadedState.code
            && gist === loadedState.gist;
        if (sameAsLoaded)
            return;
        saveState({ code, options: { ...options, language, branch, target }, gist });
    }, [loadedState, language, branch, target, options, code, gist]);

    if (!options)
        return null;

    const renderOptionProviders = (children: ReactNode) => {
        const optionNames = ['release'] as const;

        return optionNames.reduce(<TName extends OptionName>(children: ReactNode, name: TName) => <MutableValueProvider
            context={optionContexts[name]}
            value={options[name]}
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            setValue={value => setOptions(options => ({ ...options!, [name]: value }))}
        >{children}</MutableValueProvider>, children);
    };

    return <InitialCodeContext.Provider value={initialCode}>
        <BranchesContext.Provider value={branches ?? EMPTY_BRANCHES}>
            {renderOptionProviders(<ResultContext.Provider value={resultContext}>
                {children}
            </ResultContext.Provider>)}
        </BranchesContext.Provider>
    </InitialCodeContext.Provider>;
};